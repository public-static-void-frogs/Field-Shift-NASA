from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.api.auth import CurrentUser
from app.api.dependencies import Store
from app.schemas.resources import (
    DemoSource,
    FarmProfile,
    FieldGeoJson,
    Notification,
    Overview,
    TeamMember,
)
from app.schemas.weather import CurrentWeather, WeatherSeries
from app.services import resources as service
from app.services.crop_conditions import assessment_context, field_location
from app.services.overview import charts

router = APIRouter()


@router.get("/farm/profile", response_model=FarmProfile, tags=["farm"])
def farm(store: Store, user: CurrentUser):
    return service.farm_profile(store, user)


@router.get("/weather/current", response_model=CurrentWeather, tags=["weather"])
def current_weather(request: Request, user: CurrentUser):
    return request.app.state.weather.current(user.settings)


@router.get(
    "/weather/history",
    response_model=WeatherSeries,
    tags=["weather"],
    description="Completed daily model estimates, newest first. Uses saved coordinates, time zone and units. Provide both dates for a custom period of up to 366 days; otherwise days selects a trailing range. Missing readings remain null. Soil moisture is volumetric water content at 0–7 cm, not a field sensor or root-zone measurement. An optional field_id selects field coordinates and returns estimated crop limits and daily risk assessments; climate context uses this requested history window.",
    responses={
        422: {"description": "Missing location or invalid date range"},
        503: {"description": "Provider unavailable or malformed response; no demo fallback"},
    },
)
def weather_history(
    request: Request,
    user: CurrentUser,
    store: Store,
    field_id: UUID | None = Query(
        default=None,
        description="Assess this field's crop and soil using weather at its geometry center and farm time zone. Omit for unassessed weather at the saved account location.",
    ),
    days: Literal["7", "30", "90"] = "30",
    start_date: date | None = None,
    end_date: date | None = None,
):
    field = store.require_field(field_id) if field_id else None
    location = user.settings
    if field:
        location = field_location(user.settings, field, store.require("farms", field["farmId"]))
    series = request.app.state.weather.history(location, int(days), start_date, end_date)
    if field:
        return request.app.state.crop_model.predict(series, assessment_context(series, field))
    return series


@router.get(
    "/weather/forecast",
    response_model=WeatherSeries,
    tags=["weather"],
    description="14 daily forecasts, oldest first, starting today in the saved time zone. Shares a 10-minute upstream cache with current weather. Metrics are nullable, wind is the daily maximum and soil moisture is the daily mean at 0–1 cm. An optional field_id returns backend crop limits, suitability scores and structured daily alerts using a versioned illustrative estimator. Its climate context is the forecast window, not long-term climate normals. Omitting field_id preserves account-location weather and returns null cropAssessment. This is not a calibrated agronomic prediction.",
    responses={
        422: {"description": "Missing saved coordinates"},
        503: {"description": "Provider unavailable; no demo fallback"},
    },
)
def weather_forecast(
    request: Request,
    user: CurrentUser,
    store: Store,
    field_id: UUID | None = Query(
        default=None,
        description="Assess this field's crop and soil using weather at its geometry center and farm time zone. Omit for unassessed weather at the saved account location.",
    ),
):
    field = store.require_field(field_id) if field_id else None
    location = user.settings
    if field:
        location = field_location(user.settings, field, store.require("farms", field["farmId"]))
    series = request.app.state.weather.forecast(location)
    if field:
        return request.app.state.crop_model.predict(series, assessment_context(series, field))
    return series


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
