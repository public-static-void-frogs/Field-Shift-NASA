from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic import Field as Value

from app.schemas.geometry import Geometry

Crop = Literal["Winter wheat", "Corn", "Soybeans"]


class CreateField(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    parcelId: int = Value(gt=0, strict=True)
    name: str = Value(min_length=1, max_length=60)
    crop: Crop


class Field(BaseModel):
    id: UUID
    parcelId: int
    farmId: UUID
    cropId: UUID
    geometry: Geometry
    properties: "PropertyData"
    name: str
    crop: Crop
    area: float
    health: int
    moisture: int
    nitrogen: int
    status: Literal["Healthy", "Needs attention", "Critical"]
    planted: str


class Parcel(BaseModel):
    id: int
    name: str
    crop: Crop
    area: float
    soilType: str


class CropOption(BaseModel):
    value: Crop
    label: str


class FieldProperties(BaseModel):
    soilType: str
    soilPh: float
    phosphorus: float
    potassium: float
    organicMatter: float
    soilTemperature: float
    conductivity: float
    cationExchange: float
    bulkDensity: float
    rootingDepth: float
    variety: str
    emergence: float
    plantDensity: float
    vegetationIndex: float
    yieldTarget: float
    harvestWindow: str
    elevation: float
    slope: float
    drainage: str
    irrigation: str
    lastIrrigation: str
    waterApplied: float
    rainfall: float
    waterCapacity: float


class PropertyData(BaseModel):
    soil: FieldProperties
    crop: FieldProperties
    growthStage: str
    lastSample: str
    cultivationPractice: str
    tenure: str


class LandEvent(BaseModel):
    id: UUID
    fieldId: UUID
    date: str
    category: str
    title: str
    description: str
    measurements: list[str] = []
    attention: bool | None = None


class CropSeason(BaseModel):
    id: UUID
    fieldId: UUID
    cropId: UUID
    year: int
    crop: str
    planted: str
    harvested: str
    yield_: str = Value(alias="yield")
    soilCondition: str


class FieldHistory(BaseModel):
    events: list[LandEvent]
    seasons: list[CropSeason]


class Recommendation(BaseModel):
    title: str
    description: str
    nextStep: str


Field.model_rebuild()
