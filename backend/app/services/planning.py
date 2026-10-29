"""Join stored schedules and strategy records; reads never regenerate demo history."""

from app.core.errors import ResourceNotFound


def context(store):
    return store.all("planning_contexts")[0]


def field_events(store, field_id):
    field = store.require_field(field_id)
    return sorted(
        [
            dict(row, fieldName=field["name"])
            for row in store.related("planned_events", "fieldId", field_id)
        ],
        key=lambda e: (e["date"], e["id"]),
    )


def rotation(store, field_id):
    field = store.require_field(field_id)
    rows = store.related("rotation_plans", "fieldId", field_id)
    if not rows:
        raise ResourceNotFound("Rotation plan not found")
    row = rows[0]
    return dict(
        row,
        currentCrop=field["crop"],
        nextCrop=store.require("crops", row["nextCropId"])["name"],
        followingCrop=store.require("crops", row["followingCropId"])["name"],
    )


def strategy(store, field_id):
    plan, events = rotation(store, field_id), field_events(store, field_id)
    contingencies = [
        store.require("contingencies", row["contingencyId"])
        for row in store.related("plan_contingencies", "planId", plan["id"])
    ]
    return dict(
        plan=plan,
        events=events,
        steps=[
            dict(event=e, checkpoint=store.require("checkpoints", e["checkpointId"])["description"])
            for e in events
        ],
        forecast=sorted(
            store.related("strategy_forecasts", "fieldId", field_id), key=lambda row: row["date"]
        ),
        technicals=store.related("strategy_technicals", "fieldId", field_id),
        comparison=store.related("strategy_comparisons", "fieldId", field_id),
        contingencies=contingencies,
    )


def system_events(store):
    return sorted(
        [event for field in store.all("fields") for event in field_events(store, field["id"])],
        key=lambda e: (e["date"], e["id"]),
    )
