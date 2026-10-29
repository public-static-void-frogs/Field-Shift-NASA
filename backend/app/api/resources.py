from typing import Literal

from fastapi import APIRouter, Query

from app.api.dependencies import Store
from app.data import fixture
from app.schemas.resources import (
    CurrentWeather,
    DemoSource,
    FarmProfile,
    FieldGeoJson,
    Notification,
    Overview,
    TeamMember,
    WeatherRecord,
)
from app.services.notifications import notifications
from app.services.overview import charts

router = APIRouter()


@router.get("/farm/profile", response_model=FarmProfile, tags=["farm"])
def farm():
    return fixture("farm")


@router.get("/weather/current", response_model=CurrentWeather, tags=["weather"])
def current_weather():
    return fixture("weather")["current"]


@router.get("/weather/history", response_model=list[WeatherRecord], tags=["weather"])
def weather_history(days: Literal["7", "30", "90"] = "30"):
    return fixture("weather")["history"][: int(days)]


@router.get("/maps/geojson", response_model=FieldGeoJson, tags=["maps"])
def geojson():
    return fixture("maps")


@router.get("/help/team", response_model=list[TeamMember], tags=["help"])
def team():
    return fixture("help")["team"]


@router.get("/help/sources", response_model=list[DemoSource], tags=["help"])
def sources():
    return fixture("help")["sources"]


@router.get(
    "/notifications",
    response_model=list[Notification],
    response_model_exclude_unset=True,
    tags=["notifications"],
)
def list_notifications(store: Store):
    return notifications(store.fields())


@router.get("/overview/charts", response_model=Overview, tags=["overview"])
def overview(
    store: Store,
    days: int = Query(default=30, ge=1, le=365),
    metric: Literal["health", "moisture"] = "health",
):
    return charts(store.fields(), days, metric)
