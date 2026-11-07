from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.geometry import Geometry


class PointGeometry(BaseModel):
    type: Literal["Point"]
    coordinates: tuple[float, float]


class ViewProperties(BaseModel):
    kind: Literal["cluster", "field"]
    count: int | None = None
    area: float
    bounds: list[float] | None = None
    catalogFieldId: UUID | None = None
    fieldId: UUID | None = None
    sourceId: str | None = None
    parcelId: int | None = None
    name: str | None = None
    crop: str | None = None
    boundaryKind: str | None = None


class ViewFeature(BaseModel):
    type: Literal["Feature"]
    id: str
    geometry: Geometry | PointGeometry
    properties: ViewProperties


class MapView(BaseModel):
    type: Literal["FeatureCollection"]
    mode: Literal["clusters", "fields"]
    bounds: list[float]
    total: int
    features: list[ViewFeature]
    limit: int
    source: str
    approximate: bool


class MapSummary(BaseModel):
    total: int
    bounds: list[float] | None
    defaultCenter: list[float]
    defaultZoom: int
    source: str
    boundaryKind: str
    importedAt: str | None
    status: str = "ready"
