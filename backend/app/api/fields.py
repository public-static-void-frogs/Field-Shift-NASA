from typing import get_args
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.api.auth import CurrentUser
from app.api.dependencies import FieldId, ParcelId, Store
from app.schemas.fields import (
    CreateField,
    Crop,
    CropOption,
    Field,
    FieldHistory,
    Parcel,
    PropertyData,
    Recommendation,
    SaveCropAreas,
)
from app.schemas.rotation import Priority, RotationAdvice
from app.services import fields as service
from app.services import rotation_advice

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


@router.post("/fields/crop-areas", response_model=list[Field])
def add_crop_areas(input: SaveCropAreas, store: Store):
    """Merge selected polygons into the caller's saved crop areas."""
    from app.services.saved_crop_areas import save_crop_areas

    return save_crop_areas(store, input.areas)


@router.put("/fields/{field_id}/selection", response_model=Field)
def select_field(field_id: FieldId, store: Store):
    """Select a catalog field for the caller; repeated selections are idempotent."""
    return store.select(field_id)


@router.get("/crops", response_model=list[CropOption])
def crops():
    return [dict(value=name, label=name) for name in get_args(Crop)]


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
def recommendation(field_id: FieldId, store: Store, request: Request):
    """A short reading of the rotation advice for the field's own or most recent crop."""
    field = store.require_field(field_id)
    return rotation_advice.summary(request.app.state.rotation.advise(field, None, [], "metric"))


@router.get(
    "/fields/{field_id}/rotation-advice",
    response_model=RotationAdvice,
    responses={422: {"description": "Crop is not a candidate for this field"}},
)
def rotation_advice_for_field(
    field_id: FieldId,
    store: Store,
    request: Request,
    user: CurrentUser,
    crop: str | None = Query(
        default=None,
        max_length=60,
        description="Crop id to assess; defaults to the field's crop, else its most recent "
        "satellite-estimated crop",
    ),
    priorities: list[Priority] = Query(default_factory=list),
):
    """Rank the candidate crops for the coming season with the rotation rule engine.

    Lower scores carry less risk. Crop history from CDL is a satellite estimate, not a farmer
    record. Missing inputs are listed in `dataGaps` instead of being guessed.
    """
    field = store.require_field(field_id)
    return request.app.state.rotation.advise(field, crop, priorities, user.settings.units)
