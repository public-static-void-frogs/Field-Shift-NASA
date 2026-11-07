"""Illustrative crop suitability estimator. Replace CropConditionModel, not the HTTP contract.

This is deliberately not a trained model or calibrated agronomic advice. Climate inputs
are the requested weather window; user-supplied soil data and shallow model moisture are proxies.
All calculations use SI units internally and convert the complete result at the boundary.
"""

from copy import deepcopy
from statistics import mean
from types import SimpleNamespace
from typing import Protocol

from fastapi import HTTPException

from app.schemas.crop_conditions import CropAssessmentContext, CropMetricBounds

METRICS = ("temperature", "rainfall", "moisture", "humidity", "wind")
ORDER = {"unknown": -1, "good": 0, "caution": 1, "high": 2}
# critical low, good low, ideal, good high, critical high: illustrative growing-season priors.
CROP_TEMPERATURES = {
    "Winter wheat": (0, 8, 18, 24, 30),
    "Corn": (8, 16, 24, 30, 36),
    "Soybeans": (6, 14, 23, 29, 35),
}


class CropConditionModel(Protocol):
    def predict(self, series: dict, context: CropAssessmentContext) -> dict: ...


def field_location(preferences, field):
    soil = (field.get("properties") or {}).get("soil", {})
    required = ("soilType", "soilPh", "organicMatter", "waterCapacity", "drainage")
    if any(soil.get(key) is None for key in required):
        raise HTTPException(
            status_code=422, detail="Field soil data is required for crop assessment"
        )
    geometry = field["geometry"]
    polygons = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        polygons = [polygons]
    points = [point for polygon in polygons for point in polygon[0]]
    return SimpleNamespace(
        latitude=(min(p[1] for p in points) + max(p[1] for p in points)) / 2,
        longitude=(min(p[0] for p in points) + max(p[0] for p in points)) / 2,
        time_zone=preferences.time_zone,
        units=preferences.units,
        location=field["name"],
    )


def _si(value, metric, units):
    if value is None:
        return None
    if metric == "temperature" and units[metric] == "°F":
        return round((value - 32) * 5 / 9, 4)
    if metric == "rainfall" and units[metric] == "in":
        return round(value * 25.4, 4)
    if metric == "wind" and units[metric] == "mph":
        return round(value * 1.609344, 4)
    return value


def _display(value, metric, units):
    if value is None:
        return None
    if metric == "temperature" and units[metric] == "°F":
        value = value * 9 / 5 + 32
    elif metric == "rainfall" and units[metric] == "in":
        value /= 25.4
    elif metric == "wind" and units[metric] == "mph":
        value /= 1.609344
    return round(value, 2)


def _average(records, key):
    values = [row[key] for row in records if row[key] is not None]
    return round(mean(values), 2) if values else None


def assessment_context(series, field):
    records = series["records"]
    dates = [row["date"] for row in records]
    soil = field["properties"]["soil"]
    return CropAssessmentContext(
        fieldId=field["id"],
        fieldName=field["name"],
        crop=field["crop"],
        latitude=series["latitude"],
        longitude=series["longitude"],
        soil={
            key: soil[key]
            for key in ("soilType", "soilPh", "organicMatter", "waterCapacity", "drainage")
        },
        climate=dict(
            source="history_window"
            if series["dataKind"] == "historical_model"
            else "forecast_window",
            startDate=min(dates),
            endDate=max(dates),
            sampleDays=len(records),
            meanHigh=_average(records, "temperature"),
            meanLow=_average(records, "low"),
            meanHumidity=_average(records, "humidity"),
            meanDailyRainfall=_average(records, "rainfall"),
        ),
    )


def _evaluate(value, bounds):
    if value is None:
        return "unknown", None, None, None
    if bounds.criticalLow is not None and value <= bounds.criticalLow:
        return "high", 10.0, "below_critical", bounds.criticalLow
    if bounds.criticalHigh is not None and value >= bounds.criticalHigh:
        return "high", 10.0, "above_critical", bounds.criticalHigh
    if value < bounds.goodLow:
        span = bounds.goodLow - (
            bounds.criticalLow if bounds.criticalLow is not None else bounds.goodLow - 1
        )
        score = 70 - 50 * (bounds.goodLow - value) / span
        return "caution", round(max(20, score), 1), "below_good", bounds.goodLow
    if value > bounds.goodHigh:
        span = (
            bounds.criticalHigh if bounds.criticalHigh is not None else bounds.goodHigh + 1
        ) - bounds.goodHigh
        score = 70 - 50 * (value - bounds.goodHigh) / span
        return "caution", round(max(20, score), 1), "above_good", bounds.goodHigh
    span = max(bounds.ideal - bounds.goodLow, bounds.goodHigh - bounds.ideal, 1)
    return "good", round(100 - 25 * abs(value - bounds.ideal) / span, 1), None, None


def _pressure(value, start, span):
    """A bounded illustrative interaction; absent inputs contribute no adjustment."""
    if value is None:
        return 0.0
    return max(0.0, min(1.0, (value - start) / span))


def _mean_si(series, key, metric):
    values = [
        _si(row[key], metric, series["units"]) for row in series["records"] if row[key] is not None
    ]
    return round(mean(values), 4) if values else None


def _condition_priors(series, context):
    """Limits for the supplied readings, with cross-metric and field interactions.

    A singleton series produces daily limits; the full series supplies reference
    metadata. Coefficients are illustrative, not calibrated crop physiology.
    """
    soil = context.soil
    heat = _mean_si(series, "temperature", "temperature")
    humidity = _mean_si(series, "humidity", "humidity")
    water = _mean_si(series, "moisture", "moisture")
    rain = _mean_si(series, "rainfall", "rainfall")
    wind = _mean_si(series, "wind", "wind")
    adaptation = 0 if heat is None else max(-1.5, min(1.5, (heat - 20) / 10))
    buffering = max(-1, min(1, (soil.waterCapacity - 170) / 60 + (soil.organicMatter - 3.5) / 3))
    moisture = [7, 15, 25, 35, 48]
    if "sand" in soil.soilType.lower():
        moisture = [4, 8, 17, 27, 38]
    elif "clay" in soil.soilType.lower():
        moisture = [10, 20, 30, 42, 55]
    # Relative to the soil texture's base range, so clay is not treated like sand.
    dry_soil = _pressure(None if water is None else moisture[1] - water, 0, moisture[1])
    wet_soil = _pressure(water, moisture[3], moisture[4] - moisture[3])
    humid_air = _pressure(humidity, 70, 25)
    dry_air = _pressure(None if humidity is None else 45 - humidity, 0, 25)
    hot_weather = _pressure(heat, 25, 10)
    windy_weather = _pressure(wind, 15, 20)
    sustained_rain = _pressure(rain, 4, 12)
    drainage = soil.drainage.lower()
    poor_drainage = float("poor" in drainage)
    ph_stress = max(_pressure(6 - soil.soilPh, 0, 1.5), _pressure(soil.soilPh, 7.5, 1.5))

    temperature = list(CROP_TEMPERATURES[context.crop])
    temperature[0] += 1.5 * wet_soil + 0.5 * windy_weather
    temperature[1] += 0.8 * wet_soil
    temperature[2] += adaptation - 0.6 * humid_air
    temperature[3] += adaptation - 1.2 * humid_air - 1.5 * dry_soil - 0.5 * dry_air
    temperature[4] += buffering - 2 * humid_air - 2.5 * dry_soil - 0.8 * dry_air - ph_stress

    # Warm/wet combinations narrow the humidity range, especially for supported
    # crops with greater illustrative sensitivity to damp conditions.
    damp_sensitivity = {"Winter wheat": 1.0, "Corn": 0.7, "Soybeans": 0.9}[context.crop]
    damp_pressure = damp_sensitivity * (wet_soil + 0.5 * sustained_rain)
    humidity_bounds = [
        20 + 3 * dry_soil,
        40 + 2 * dry_soil,
        60 - 2 * wet_soil,
        80 - 4 * damp_pressure - 2 * hot_weather,
        95 - 5 * damp_pressure - 2 * hot_weather - 2 * poor_drainage,
    ]
    moisture[0] += 2 * hot_weather + windy_weather + dry_air
    moisture[1] += 3 * hot_weather + 2 * windy_weather + dry_air
    moisture[2] += hot_weather - humid_air
    moisture[3] -= 2 * humid_air + 2 * poor_drainage
    moisture[4] -= 3 * humid_air + 2 * sustained_rain + 2 * poor_drainage

    rainfall_high = max(6, min(12, soil.waterCapacity / 20))
    if "drained" in drainage and "moderately" not in drainage and not poor_drainage:
        rainfall_high += 1
    rainfall_high *= 1 - 0.2 * wet_soil - 0.1 * humid_air - 0.15 * poor_drainage
    return {
        "temperature": temperature,
        "moisture": moisture,
        "rainfall": [None, 0, 2, rainfall_high, rainfall_high * 2],
        "humidity": humidity_bounds,
        "wind": [
            None,
            0,
            8,
            20 - 3 * dry_soil - 2 * hot_weather,
            35 - 5 * dry_soil - 3 * dry_air - 2 * hot_weather,
        ],
    }


def _metric_bounds(series, context):
    return {
        metric: CropMetricBounds(
            unit=series["units"].get(metric, "%"),
            **dict(zip(("criticalLow", "goodLow", "ideal", "goodHigh", "criticalHigh"), values)),
        )
        for metric, values in _condition_priors(series, context).items()
    }


def _display_bounds(bounds, units):
    return {
        metric: dict(
            unit=value.unit,
            **{
                key: _display(getattr(value, key), metric, units)
                for key in ("criticalLow", "goodLow", "ideal", "goodHigh", "criticalHigh")
            },
        )
        for metric, value in bounds.items()
    }


class HeuristicCropConditionModel:
    """Stable replaceable predictor; a trained implementation can return this same result shape."""

    def predict(self, series, context):
        result = deepcopy(series)
        units = series["units"]
        reference_bounds = _metric_bounds(series, context)
        for record in result["records"]:
            bounds = _metric_bounds({**series, "records": [record]}, context)
            alerts, metrics, scores = [], {}, []
            available = 0
            for metric in METRICS:
                risk, score, code, boundary = _evaluate(
                    _si(record[metric], metric, units), bounds[metric]
                )
                value_risk = risk
                low_risk = None
                readings = [("value", record[metric], risk, code, boundary)]
                if metric == "temperature":
                    low_risk, low_score, low_code, low_boundary = _evaluate(
                        _si(record["low"], metric, units), bounds[metric]
                    )
                    readings.append(("low", record["low"], low_risk, low_code, low_boundary))
                    risk = max((risk, low_risk), key=ORDER.get)
                    present = [value for value in (score, low_score) if value is not None]
                    score = min(present) if present else None
                if score is not None:
                    scores.append(score)
                if record[metric] is not None and (
                    metric != "temperature" or record["low"] is not None
                ):
                    available += 1
                metrics[metric] = dict(
                    riskLevel=risk,
                    valueRiskLevel=value_risk,
                    lowRiskLevel=low_risk,
                    suitabilityScore=score,
                )
                for reading, value, severity, reason, limit in readings:
                    if reason:
                        alerts.append(
                            dict(
                                metric=metric,
                                reading=reading,
                                severity=severity,
                                code=reason,
                                value=value,
                                boundary=_display(limit, metric, units),
                                unit=units.get(metric, "%"),
                            )
                        )
            level = max((value["riskLevel"] for value in metrics.values()), key=ORDER.get)
            if available < len(METRICS) and level == "good":
                level = "unknown"
            coverage = "complete" if available == len(METRICS) else "partial"
            if not scores:
                coverage = "unavailable"
            record["cropAssessment"] = dict(
                bounds=_display_bounds(bounds, units),
                suitabilityScore=min(scores) if scores else None,
                riskLevel=level,
                coverage=coverage,
                metrics=metrics,
                alerts=alerts,
            )
        result["cropAssessment"] = dict(
            model=dict(id="crop-conditions-estimator", version="1.2.0", kind="heuristic_stub"),
            context=context.model_dump(mode="json"),
            bounds=_display_bounds(reference_bounds, units),
        )
        return result
