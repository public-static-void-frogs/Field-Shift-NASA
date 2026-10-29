from fastapi import APIRouter, HTTPException

from app.api.dependencies import FieldId, Store
from app.data import fixture
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
def crops():
    return fixture("fields")["crops"]


@router.get("/parcels/{field_id}", response_model=Parcel)
def parcel(field_id: FieldId):
    result = next((p for p in fixture("fields")["parcels"] if p["id"] == field_id), None)
    if result is None:
        raise HTTPException(404, "Parcel not found")
    return result


@router.get("/fields/{field_id}", response_model=Field)
def field(field_id: FieldId, store: Store):
    return store.require_field(field_id)


@router.delete("/fields/{field_id}", response_model=int)
def delete_field(field_id: FieldId, store: Store):
    return store.remove(field_id)


@router.get("/fields/{field_id}/properties", response_model=PropertyData)
def properties(field_id: FieldId, store: Store):
    return service.properties(store.require_field(field_id))


@router.get(
    "/fields/{field_id}/history", response_model=FieldHistory, response_model_exclude_unset=True
)
def history(field_id: FieldId, store: Store):
    return service.history(store.require_field(field_id))


@router.get("/fields/{field_id}/recommendation", response_model=Recommendation)
def recommendation(field_id: FieldId, store: Store):
    return service.recommendation(store.require_field(field_id))
