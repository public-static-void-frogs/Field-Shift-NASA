"""Shared field catalog and account-scoped selections stored in SQL."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    func,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.database import Base
from app.core.errors import ResourceConflict, ResourceNotFound
from app.schemas.fields import CreateField


class FieldRecord(Base):
    __tablename__ = "fields"
    __table_args__ = (CheckConstraint("area > 0", name="positive_field_area"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    parcel_id: Mapped[int | None] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(String(60))
    crop: Mapped[str | None] = mapped_column(String(30))
    area: Mapped[float] = mapped_column(Float)
    geometry: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))
    # Optional supplied attributes are kept together; absent measurements stay absent.
    attributes: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    source_id: Mapped[str | None] = mapped_column(String(32), unique=True)
    boundary_kind: Mapped[str] = mapped_column(String(24), default="user_geometry")
    state_fips: Mapped[str | None] = mapped_column(String(2))
    county_fips: Mapped[str | None] = mapped_column(String(3))
    county: Mapped[str | None] = mapped_column(String(80))
    min_lon: Mapped[float | None] = mapped_column(Float)
    min_lat: Mapped[float | None] = mapped_column(Float)
    max_lon: Mapped[float | None] = mapped_column(Float)
    max_lat: Mapped[float | None] = mapped_column(Float)
    centroid_lon: Mapped[float | None] = mapped_column(Float)
    centroid_lat: Mapped[float | None] = mapped_column(Float)


Index(
    "ix_fields_spatial",
    func.box(
        func.point(FieldRecord.min_lon, FieldRecord.min_lat),
        func.point(FieldRecord.max_lon, FieldRecord.max_lat),
    ),
    postgresql_using="gist",
).ddl_if(dialect="postgresql")


class UserField(Base):
    __tablename__ = "user_fields"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    field_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("fields.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    selected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


def field_view(row: FieldRecord):
    from app.services.maps import rectangle

    attributes = {
        "properties": None,
        "planted": None,
        "health": None,
        "moisture": None,
        "nitrogen": None,
        "status": None,
        **row.attributes,
    }
    return dict(
        attributes,
        id=row.id,
        parcelId=row.parcel_id,
        name=row.name,
        crop=row.crop,
        area=row.area,
        geometry=row.geometry or rectangle((row.min_lon, row.min_lat, row.max_lon, row.max_lat)),
        sourceId=row.source_id,
        boundaryKind=row.boundary_kind,
        sourceYear=2025 if row.source_id else None,
        county=row.county,
        stateFips=row.state_fips,
        countyFips=row.county_fips,
    )


class FieldRepository:
    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def catalog(self, offset=0, limit=100):
        return [
            field_view(row)
            for row in self.session.scalars(
                select(FieldRecord).order_by(FieldRecord.id).offset(offset).limit(limit)
            )
        ]

    def catalog_field(self, field_id):
        row = self.session.get(FieldRecord, str(field_id))
        if row is None:
            raise ResourceNotFound("Field not found")
        return field_view(row)

    def fields(self):
        rows = self.session.scalars(
            select(FieldRecord)
            .join(UserField)
            .where(UserField.user_id == self.user_id)
            .order_by(UserField.selected_at, FieldRecord.id)
        )
        return [field_view(row) for row in rows]

    def require_field(self, field_id):
        if self.session.get(UserField, (self.user_id, str(field_id))) is None:
            raise ResourceNotFound("Field not found")
        return field_view(self.session.get(FieldRecord, str(field_id)))

    def parcel(self, parcel_id):
        row = self.session.scalar(select(FieldRecord).where(FieldRecord.parcel_id == parcel_id))
        if row is None:
            raise ResourceNotFound("Parcel not found")
        soil = (row.attributes.get("properties") or {}).get("soil", {})
        return dict(
            id=parcel_id, name=row.name, crop=row.crop, area=row.area, soilType=soil.get("soilType")
        )

    def create(self, payload: CreateField):
        from app.services.maps import geometry_bounds, update_cells

        data = payload.model_dump(mode="json")
        bounds = geometry_bounds(data["geometry"])
        row = FieldRecord(
            parcel_id=data.pop("parcelId"),
            name=data.pop("name"),
            crop=data.pop("crop"),
            area=data.pop("area"),
            geometry=data.pop("geometry"),
            attributes=data,
            min_lon=bounds[0],
            min_lat=bounds[1],
            max_lon=bounds[2],
            max_lat=bounds[3],
            centroid_lon=(bounds[0] + bounds[2]) / 2,
            centroid_lat=(bounds[1] + bounds[3]) / 2,
        )
        self.session.add(row)
        try:
            self.session.flush()
            self.session.add(UserField(user_id=self.user_id, field_id=row.id))
            update_cells(self.session, row)
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise ResourceConflict("A field with this parcel ID already exists") from error
        return field_view(row)

    def select(self, field_id):
        fid = str(field_id)
        row = self.session.get(FieldRecord, fid)
        if row is None:
            raise ResourceNotFound("Field not found")
        if self.session.get(UserField, (self.user_id, fid)) is None:
            self.session.add(UserField(user_id=self.user_id, field_id=fid))
            try:
                self.session.commit()
            except IntegrityError:
                self.session.rollback()
                # Concurrent identical selections are still a successful PUT.
                if self.session.get(UserField, (self.user_id, fid)) is None:
                    raise
        return field_view(row)

    def remove(self, field_id):
        self.require_field(field_id)
        self.session.delete(self.session.get(UserField, (self.user_id, str(field_id))))
        self.session.commit()
        return str(field_id)
