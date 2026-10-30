from typing import Literal

from fastapi import APIRouter, Query

from app.api.auth import CurrentUser
from app.api.dependencies import Store
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
from app.services import resources as service
from app.services.overview import charts

router = APIRouter()


@router.get("/farm/profile", response_model=FarmProfile, tags=["farm"])
def farm(store: Store, user: CurrentUser):
    return service.farm_profile(store, user)


@router.get("/weather/current", response_model=CurrentWeather, tags=["weather"])
def current_weather(store: Store):
    return service.current_weather(store)


@router.get("/weather/history", response_model=list[WeatherRecord], tags=["weather"])
def weather_history(store: Store, days: Literal["7", "30", "90"] = "30"):
    return service.weather_history(store, int(days))


@router.get("/maps/geojson", response_model=FieldGeoJson, tags=["maps"])
def geojson(store: Store):
    return service.geojson(store)


@router.get("/help/team", response_model=list[TeamMember], tags=["help"])
def team(store: Store):
    return store.all("team_members")


@router.get("/help/sources", response_model=list[DemoSource], tags=["help"])
def sources(store: Store):
    return store.all("demo_sources")


@router.get(
    "/notifications",
    response_model=list[Notification],
    response_model_exclude_unset=True,
    tags=["notifications"],
)
def list_notifications(store: Store):
    return service.notifications(store)


@router.get("/overview/charts", response_model=Overview, tags=["overview"])
def overview(
    store: Store,
    days: int = Query(default=30, ge=1, le=365),
    metric: Literal["health", "moisture"] = "health",
):
    return charts(store, days, metric)
