from datetime import date, timedelta
from math import floor, sin

from app.data import fixture

COLORS = ["#476b3c", "#b8954d", "#345865", "#8c9e64", "#a46e56", "#7a7096"]


def charts(fields, days, metric):
    today = date.fromisoformat(fixture("planning")["today"])
    trends = []
    for index in range(13):
        day = today - timedelta(days=floor(days * (12 - index) / 12 + 0.5))
        sample = dict(date=f"{day:%b} {day.day}")
        for field_index, field in enumerate(fields):
            progress = index / 12
            wave = (
                sin(index * 0.85 + field_index) * (4 if metric == "health" else 7) * (1 - progress)
            )
            sample[f"field-{field['id']}"] = max(
                0,
                min(
                    100,
                    floor(
                        field[metric]
                        - (12 if metric == "health" else 8) * (1 - progress)
                        + wave
                        + 0.5
                    ),
                ),
            )
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
