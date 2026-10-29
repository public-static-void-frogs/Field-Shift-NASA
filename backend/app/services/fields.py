"""Assemble API read models from normalized field and crop records."""

from copy import deepcopy

from app.core.errors import ResourceNotFound


def properties(field):
    return deepcopy(field["properties"])


def history(store, field_id):
    store.require_field(field_id)
    events = store.related("history_events", "fieldId", field_id)
    seasons = []
    for row in store.related("crop_seasons", "fieldId", field_id):
        seasons.append(dict(row, crop=store.require("crops", row["cropId"])["name"]))
    return dict(
        events=sorted(events, key=lambda e: e["date"], reverse=True),
        seasons=sorted(seasons, key=lambda s: s["year"], reverse=True),
    )


def recommendation(store, field_id):
    store.require_field(field_id)
    rows = store.related("recommendations", "fieldId", field_id)
    if not rows:
        raise ResourceNotFound("Recommendation not found")
    return rows[0]
