"""Weather DTOs use explicit units, ISO dates, nullable readings and source metadata."""

from typing import Literal

from pydantic import BaseModel


class WeatherUnits(BaseModel):
    temperature: str
    rainfall: str
    wind: str
    humidity: str = "%"
    moisture: str = "%"


class WeatherMetadata(BaseModel):
    location: str
    latitude: float
    longitude: float
    gridLatitude: float
    gridLongitude: float
    timeZone: str
    fetchedAt: str
    source: str = "Open-Meteo"
    sourceUrl: str = "https://open-meteo.com/"
    units: WeatherUnits
    soilDepth: str
    dataKind: Literal["forecast", "historical_model"]


class WeatherRecord(BaseModel):
    key: int
    date: str
    today: bool
    conditions: str
    weatherCode: int | None
    temperature: float | None
    low: float | None
    rainfall: float | None
    humidity: float | None
    wind: float | None
    windDirection: float | None
    moisture: float | None
    rainChance: float | None


class WeatherSeries(WeatherMetadata):
    records: list[WeatherRecord]


class CurrentWeather(WeatherMetadata):
    observedAt: str
    condition: str
    conditions: str
    temperature: float | None
    feelsLike: float | None
    high: float | None
    low: float | None
    humidity: float | None
    wind: float | None
    windDirection: float | None
    rainChance: float | None
    forecast: list[WeatherRecord]
