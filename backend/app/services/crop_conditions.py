"""Illustrative crop suitability estimator. Replace CropConditionModel, not the HTTP contract.

This is deliberately not a trained model or calibrated agronomic advice. Climate inputs
are the requested weather window; demo soil data and shallow model moisture are proxies.
All calculations use SI units internally and convert the complete result at the boundary.
"""

from copy import deepcopy
from statistics import mean
from types import SimpleNamespace
from typing import Protocol

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


def field_location(preferences, field, farm):
    geometry = field["geometry"]
    polygons = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        polygons = [polygons]
    points = [point for polygon in polygons for point in polygon[0]]
    return SimpleNamespace(
        latitude=(min(p[1] for p in points) + max(p[1] for p in points)) / 2,
        longitude=(min(p[0] for p in points) + max(p[0] for p in points)) / 2,
        time_zone=farm["timeZone"],
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


class HeuristicCropConditionModel:
    """Stable replaceable predictor; a trained implementation can return this same result shape."""

    def predict(self, series, context):
        result = deepcopy(series)
        units = series["units"]
        soil = context.soil
        climate_high = _si(context.climate.meanHigh, "temperature", units)
        # Limited window adaptation, plus a small soil-buffering adjustment; no climatic normals implied.
        adaptation = 0 if climate_high is None else max(-1.5, min(1.5, (climate_high - 20) / 10))
        buffering = max(
            -1, min(1, (soil.waterCapacity - 170) / 60 + (soil.organicMatter - 3.5) / 3)
        )
        temperature = list(CROP_TEMPERATURES[context.crop])
        temperature[2] += adaptation
        temperature[3] += adaptation
        temperature[4] += buffering
        moisture = [7, 15, 25, 35, 48]
        if "sand" in soil.soilType.lower():
            moisture = [4, 8, 17, 27, 38]
        elif "clay" in soil.soilType.lower():
            moisture = [10, 20, 30, 42, 55]
        rainfall_high = round(max(6, min(12, soil.waterCapacity / 20)), 2)
        if "drained" in soil.drainage.lower() and "moderately" not in soil.drainage.lower():
            rainfall_high += 1
        priors = {
            "temperature": temperature,
            "moisture": moisture,
            "rainfall": [None, 0, 2, rainfall_high, rainfall_high * 2],
            "humidity": [20, 40, 60, 80, 95],
            "wind": [None, 0, 8, 20, 35],
        }
        bounds = {}
        for metric, values in priors.items():
            bounds[metric] = CropMetricBounds(
                unit=units.get(metric, "%"),
                **{
                    key: value
                    for key, value in zip(
                        ("criticalLow", "goodLow", "ideal", "goodHigh", "criticalHigh"), values
                    )
                },
            )
        for record in result["records"]:
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
                suitabilityScore=min(scores) if scores else None,
                riskLevel=level,
                coverage=coverage,
                metrics=metrics,
                alerts=alerts,
            )
        converted = {}
        for metric, value in bounds.items():
            converted[metric] = dict(
                unit=value.unit,
                **{
                    key: _display(getattr(value, key), metric, units)
                    for key in ("criticalLow", "goodLow", "ideal", "goodHigh", "criticalHigh")
                },
            )
        result["cropAssessment"] = dict(
            model=dict(id="crop-conditions-estimator", version="1.0.0", kind="heuristic_stub"),
            context=context.model_dump(mode="json"),
            bounds=converted,
        )
        return result
