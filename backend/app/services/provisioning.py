"""Build related demo records once on creation, then store them like inserted rows."""

from datetime import datetime
from uuid import uuid4

from app.services.planning_builder import strategy


def key():
    return str(uuid4())


def field_records(field, reference):
    crop_ids = {row["name"]: row["id"] for row in reference["crops"]}
    result = strategy(field, reference)
    fid = field["id"]
    plan = result["plan"]
    plan_row = {
        k: v for k, v in plan.items() if k not in ("currentCrop", "nextCrop", "followingCrop")
    }
    plan_row.update(
        id=key(),
        nextCropId=crop_ids[plan["nextCrop"]],
        followingCropId=crop_ids[plan["followingCrop"]],
    )
    events = [
        {k: v for k, v in event.items() if k not in ("fieldName", "code")}
        for event in result["events"]
    ]
    records = {"rotation_plans": [plan_row], "planned_events": events}
    records["field_readings"] = [
        dict(
            id=key(),
            fieldId=fid,
            date=reference["planning_contexts"][0]["today"],
            **{key: field[key] for key in ("health", "moisture", "nitrogen")},
        )
    ]
    for table, resource in [
        ("strategy_forecasts", "forecast"),
        ("strategy_technicals", "technicals"),
        ("strategy_comparisons", "comparison"),
    ]:
        records[table] = [dict(row, id=key(), fieldId=fid) for row in result[resource]]
    records["plan_contingencies"] = [
        dict(id=key(), planId=plan_row["id"], contingencyId=row["id"])
        for row in reference["contingencies"]
    ]
    records["crop_seasons"] = [
        dict(
            id=key(),
            fieldId=fid,
            cropId=field["cropId"],
            year=2026,
            planted=field["planted"],
            harvested="Growing season in progress",
            **{"yield": "Not harvested"},
            soilCondition="Soil structure maintained",
        )
    ]
    records["history_events"] = [
        dict(
            id=key(),
            fieldId=fid,
            date=datetime.strptime(field["planted"], "%B %d, %Y").date().isoformat(),
            category="Crop rotation",
            title=f"{field['crop']} planted for the 2026 season",
            description=f"{field['name']} was registered with {field['crop'].lower()} as its current crop.",
            measurements=[f"Planted area {field['area']} ha"],
        )
    ]
    records["recommendations"] = [
        dict(
            id=key(),
            fieldId=fid,
            title="Things are growing in the right direction.",
            description=f"{field['name']} is in good shape. Soil moisture and nitrogen levels are supporting steady {field['crop'].lower()} growth. Keep your current care routine and check again after Thursday’s expected rain.",
            nextStep="Check crop growth and soil moisture in 3 days.",
        )
    ]
    return records
