from uuid import UUID

from fastapi import APIRouter

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


@router.post(
    "/fields",
    response_model=Field,
    status_code=201,
    responses={
        404: {"description": "Parcel not found"},
        409: {"description": "Parcel is unavailable"},
    },
)
def create_field(input: CreateField, store: Store):
    return store.create(input.parcelId, input.name, input.crop)


@router.get("/crops", response_model=list[CropOption])
def crops(store: Store):
    return [dict(value=row["name"], label=row["name"]) for row in store.all("crops")]


@router.get("/parcels/{parcel_id}", response_model=Parcel)
def parcel(parcel_id: ParcelId, store: Store):
    return store.parcel(parcel_id)


@router.get("/fields/{field_id}", response_model=Field)
def field(field_id: FieldId, store: Store):
    return store.require_field(field_id)


@router.delete("/fields/{field_id}", response_model=UUID)
def delete_field(field_id: FieldId, store: Store):
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
