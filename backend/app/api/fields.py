from uuid import UUID

from fastapi import APIRouter, Query

from app.api.dependencies import FieldId, ParcelId, Store
from app.schemas.fields import (
    CreateField,
    CropOption,
    Field,
    FieldHistory,
    Parcel,
    PropertyData,
    Recommendation,
)
from app.services import fields as service

router = APIRouter(tags=["fields"])


@router.get("/fields", response_model=list[Field])
def list_fields(store: Store):
    return store.fields()


@router.get("/fields/catalog", response_model=list[Field])
def catalog(
    store: Store,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    """Browse shared fields available for selection by the signed-in user."""
    return store.catalog(offset, limit)


@router.get("/fields/catalog/{field_id}", response_model=Field)
def catalog_field(field_id: FieldId, store: Store):
    return store.catalog_field(field_id)


@router.post(
    "/fields",
    response_model=Field,
    status_code=201,
    responses={
        409: {"description": "Parcel ID already exists in the catalog"},
    },
)
def create_field(input: CreateField, store: Store):
    """Create a shared catalog field and select it for the caller atomically."""
    return store.create(input)


@router.put("/fields/{field_id}/selection", response_model=Field)
def select_field(field_id: FieldId, store: Store):
    """Select a catalog field for the caller; repeated selections are idempotent."""
    return store.select(field_id)


@router.get("/crops", response_model=list[CropOption])
def crops():
    return [dict(value=name, label=name) for name in ("Winter wheat", "Corn", "Soybeans")]


@router.get("/parcels/{parcel_id}", response_model=Parcel)
def parcel(parcel_id: ParcelId, store: Store):
    return store.parcel(parcel_id)


@router.get("/fields/{field_id}", response_model=Field)
def field(field_id: FieldId, store: Store):
    return store.require_field(field_id)


@router.delete("/fields/{field_id}", response_model=UUID)
def delete_field(field_id: FieldId, store: Store):
    """Remove the caller's selection while preserving the shared catalog field."""
    return store.remove(field_id)


@router.get("/fields/{field_id}/properties", response_model=PropertyData)
def properties(field_id: FieldId, store: Store):
    return service.properties(store.require_field(field_id))


@router.get(
    "/fields/{field_id}/history", response_model=FieldHistory, response_model_exclude_unset=True
)
def history(field_id: FieldId, store: Store):
    return service.history(store, field_id)


@router.get("/fields/{field_id}/recommendation", response_model=Recommendation)
def recommendation(field_id: FieldId, store: Store):
    return service.recommendation(store, field_id)
