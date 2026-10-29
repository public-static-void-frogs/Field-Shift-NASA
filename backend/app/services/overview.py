"""Build chart read models from stored observations and crop/field joins."""

from bisect import bisect_right
from datetime import date, timedelta
from math import floor

COLORS = ["#476b3c", "#b8954d", "#345865", "#8c9e64", "#a46e56", "#7a7096"]


def charts(store, days, metric):
    fields = store.fields()
    today = date.fromisoformat(store.all("planning_contexts")[0]["today"])
    readings = {}
    for field in fields:
        values = sorted(
            store.related("field_readings", "fieldId", field["id"]), key=lambda row: row["date"]
        )
        readings[field["id"]] = ([row["date"] for row in values], values)
    trends = []
    for index in range(13):
        day = today - timedelta(days=floor(days * (12 - index) / 12 + 0.5))
        sample = dict(date=f"{day:%b} {day.day}")
        for fid, (dates, values) in readings.items():
            position = bisect_right(dates, day.isoformat()) - 1
            if position >= 0:
                sample[f"field-{fid}"] = values[position][metric]
        trends.append(sample)
    totals = {}
    for field in fields:
        totals[field["crop"]] = totals.get(field["crop"], 0) + field["area"]
    return dict(
        trends=trends,
        cropAreas=[
            dict(name=name, area=round(area, 1), fill=COLORS[index % len(COLORS)])
            for index, (name, area) in enumerate(totals.items())
        ],
    )
