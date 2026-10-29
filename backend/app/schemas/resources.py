from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.geometry import Geometry


class FarmProfile(BaseModel):
    availableSeasons: list[str]
    farmName: str
    season: str
    fullName: str
    initials: str
    email: str
    role: str
    location: str
    locationLabel: str
    timeZone: str
    units: str
    theme: str


class ForecastDay(BaseModel):
    day: str
    temperature: float
    condition: str


class CurrentWeather(BaseModel):
    condition: str
    location: str
    temperature: float
    conditions: str
    feelsLike: float
    high: float
    low: float
    humidity: float
    wind: float
    rainChance: float
    forecast: list[ForecastDay]


class WeatherRecord(BaseModel):
    key: int
    date: str
    today: bool
    conditions: str
    temperature: float
    low: float
    rainfall: float
    humidity: float
    wind: float
    moisture: float


class TeamMember(BaseModel):
    id: str
    name: str
    roles: str
    alt: str


class DemoSource(BaseModel):
    key: str
    name: str
    data: str
    format: str


class Notification(BaseModel):
    id: str
    kind: Literal["field", "weather"]
    severity: Literal["error", "warning", "info"]
    fieldId: UUID | None = None
    fieldName: str | None = None
    title: str
    description: str


class CropArea(BaseModel):
    name: str
    area: float
    fill: str


class Overview(BaseModel):
    trends: list[dict[str, str | int]]
    cropAreas: list[CropArea]


class MapProperties(BaseModel):
    fieldId: UUID | None
    parcelId: int
    name: str


class MapFeature(BaseModel):
    type: Literal["Feature"]
    id: int
    properties: MapProperties
    geometry: Geometry


class FieldGeoJson(BaseModel):
    type: Literal["FeatureCollection"]
    features: list[MapFeature]
