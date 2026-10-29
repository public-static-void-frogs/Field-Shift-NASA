"""Deterministic demo agronomy. No model or external data feed is implied."""

from datetime import date, timedelta
from math import floor

from app.data import fixture
from app.services.fields import properties


def shift(value, days):
    return (date.fromisoformat(value) + timedelta(days=days)).isoformat()


def planting_date(crop, soil_ph, moisture):
    soil_days = 7 if soil_ph < 6 else 0
    moisture_days = 3 if moisture < 40 else 0
    start = shift(
        {"Soybeans": "2027-04-22", "Corn": "2027-04-18", "Winter wheat": "2026-09-25"}.get(
            crop, "2027-04-22"
        ),
        soil_days + moisture_days,
    )
    return dict(
        date=start,
        windowEnd=shift(start, 10),
        soilPreparationDays=soil_days,
        moistureReviewDays=moisture_days,
    )


def rotation(field):
    p = properties(field)["soil"]
    crop, fid = field["crop"], field["id"]
    next_crop = "Soybeans"
    if crop == "Soybeans":
        next_crop = "Winter wheat" if fid == 3 else "Corn"
    following = "Corn" if next_crop == "Soybeans" else "Soybeans"
    planting = planting_date(next_crop, p["soilPh"], field["moisture"])
    notes = [f"Starts with the regional {next_crop.lower()} planting window."]
    if planting["soilPreparationDays"]:
        notes.append(
            "Allows 7 additional days for soil preparation following the low-pH assessment."
        )
    if planting["moistureReviewDays"]:
        notes.append("Allows 3 additional days for a moisture readiness check.")
    reason = (
        f"{crop} → soybeans introduces a legume break and lowers the next crop’s nitrogen demand."
    )
    if next_crop == "Winter wheat":
        reason = "Soybeans → winter wheat diversifies the growing season and keeps living roots in the soil over winter."
    elif next_crop == "Corn":
        reason = "Soybeans → corn makes use of the legume break while changing the crop family and canopy pattern."
    nitrogen, moisture = field["nitrogen"], field["moisture"]
    reasons = [
        reason,
        f"Available nitrogen is {nitrogen} mg/kg. The plan prioritizes nutrient recovery before the next establishment."
        if nitrogen < 30
        else f"Nitrogen at {nitrogen} mg/kg and organic matter at {p['organicMatter']:.1f}% support the planned change.",
        f"Soil pH is {p['soilPh']:.1f}. A soil correction review is scheduled before planting."
        if p["soilPh"] < 6
        else f"Soil pH {p['soilPh']:.1f}, moisture {moisture}%, and the previous crop sequence were included in this outlook.",
    ]
    return dict(
        fieldId=fid,
        currentCrop=crop,
        nextCrop=next_crop,
        followingCrop=following,
        confidence={1: 91, 2: 88, 3: 93, 4: 86, 5: 92, 6: 89}.get(fid, 89),
        sowingDate=planting["date"],
        windowEnd=planting["windowEnd"],
        followingDate="2028-04-18" if following == "Corn" else "2028-04-22",
        dateExplanation=" ".join(notes),
        reasons=reasons,
        inputs=[
            dict(label="Available nitrogen", value=f"{nitrogen} mg/kg"),
            dict(label="Soil moisture", value=f"{moisture}%"),
            dict(label="Soil pH", value=f"{p['soilPh']:.1f}"),
            dict(label="Organic matter", value=f"{p['organicMatter']:.1f}%"),
        ],
    )


def field_events(field):
    plan = rotation(field)
    p = properties(field)["soil"]
    templates = fixture("planning")["eventTemplates"]
    fid, name, crop = field["id"], field["name"], field["crop"].lower()
    health, moisture, nitrogen = field["health"], field["moisture"], field["nitrogen"]
    next_crop, following = plan["nextCrop"].lower(), plan["followingCrop"].lower()
    harvest = {"Winter wheat": "2026-07-16", "Corn": "2026-10-10"}.get(field["crop"], "2026-09-20")
    events = []

    def add(key, **values):
        event = templates[key].copy()
        event.update(id=f"field-{fid}-{key}", fieldId=fid, fieldName=name, **values)
        events.append(event)

    add(
        "soil-review",
        date="2026-05-25" if field["status"] == "Critical" else "2026-05-26",
        priority="High priority" if field["status"] == "Critical" else "Routine",
        description=f"Collect samples across {name}, including the weaker growth zones. Review pH, available nutrients, and root-zone moisture before confirming the next operations.",
        rationale=f"Current pH {p['soilPh']:.1f}, nitrogen {nitrogen} mg/kg, and moisture {moisture}%.",
    )
    add(
        "inspection",
        date=shift("2026-06-01", fid % 3),
        priority="Important" if health < 70 else "Routine",
        description=f"Walk the field and compare canopy development in the marked health zones. Record pest pressure and changes in the {crop} crop.",
        rationale=f"Follow up on the current crop health score of {health}/100.",
    )
    add(
        "harvest",
        date=harvest,
        title=f"Harvest {crop}",
        description=f"Inspect maturity and grain moisture, then arrange harvest across {field['area']} hectares. Retain residues where practical and log the harvested yield.",
    )
    add(
        "seedbed",
        date=max(shift(plan["sowingDate"], -14), shift(harvest, 1)),
        title=f"Prepare the seedbed for {next_crop}",
        description=f"Review the latest soil results, manage residues, and prepare equipment for the transition to {next_crop}. Confirm seed availability and the field's trafficability.",
    )
    add(
        "rotation-2027",
        date=plan["sowingDate"],
        title=f"Plant {next_crop} for the 2027 season",
        description=f"Rotate {name} from {crop} to {next_crop}. Check soil readiness and establish the crop within the calculated ten-day planting window.",
        rationale=f"{plan['confidence']}% model confidence. {plan['dateExplanation']}",
    )
    add(
        "rotation-2028",
        date=plan["followingDate"],
        title=f"Plant {following} for the 2028 season",
        description=f"Continue the proposed rotation from {next_crop} to {following}. Review this longer-term step after the 2027 harvest and new soil results.",
    )
    if moisture < 45:
        add(
            "irrigation",
            description=f"Check water distribution and inspect the driest parts of {name}. Adjust the watering plan around the expected rain and record moisture after the next pass.",
            rationale=f"Current soil moisture is {moisture}%, below the field’s comfortable range.",
        )
    if nitrogen < 30:
        add(
            "nutrition",
            priority="High priority" if nitrogen < 20 else "Important",
            rationale=f"Available nitrogen is {nitrogen} mg/kg. Address the shortage before the next crop review.",
        )
    if date.fromisoformat(plan["sowingDate"]).year > 2026:
        add("cover-crop", date=shift(harvest, 14))
    return sorted(events, key=lambda e: (e["date"], e["id"]))


def strategy(field):
    data = fixture("planning")
    plan, events, p = rotation(field), field_events(field), properties(field)["soil"]
    harvest = next(e for e in events if e["category"] == "Harvest")
    seedbed = next(e for e in events if e["id"].endswith("-seedbed"))
    milestones = [
        (data["today"], "Current", 0),
        (shift(data["today"], 21), "Soil review", 0.2),
        (harvest["date"], "Harvest", 0.35),
        (seedbed["date"], "Preparation", 0.55),
        (plan["sowingDate"], "Planting", 0.7),
        (shift(plan["sowingDate"], 45), "Establishment", 0.85),
        (plan["followingDate"], "Next season", 1),
    ]
    health, moisture = field["health"], field["moisture"]
    projected = min(98, max(health + 4, 84))
    forecast = []
    for index, (day, stage, progress) in enumerate(sorted(milestones)):
        h = floor(health + (projected - health) * progress + 0.5)
        m = floor(moisture + (55 - moisture) * progress + 0.5)
        uncertainty = 0 if index == 0 else 5 + index * 2
        forecast.append(
            dict(
                date=day,
                stage=stage,
                progress=progress,
                health=h,
                moisture=m,
                currentHealth=health,
                currentMoisture=moisture,
                healthImprovement=[health, h],
                moistureImprovement=[min(moisture, m), max(moisture, m)],
                range=[max(0, h - uncertainty), min(100, h + uncertainty)],
            )
        )
    technicals = data["technicals"]
    values = [
        f"{field['crop']} → {plan['nextCrop']} → {plan['followingCrop']}",
        f"{p['soilPh']:.1f}",
        f"{moisture}%",
        f"{field['nitrogen']} mg/kg",
        f"{p['organicMatter']:.1f}%",
        p["drainage"],
        f"{p['rootingDepth']} cm",
    ]
    for item, value in zip(technicals, values):
        item["value"] = value
    technicals[1]["role"] = (
        "Adds 7 days for soil correction review."
        if p["soilPh"] < 6
        else "No pH-related delay in this draft."
    )
    technicals[2]["role"] = (
        "Adds 3 days for a moisture readiness check."
        if moisture < 40
        else "No moisture-related delay in this draft."
    )
    technicals[3]["role"] = (
        "A nutrient review is included in the proposed events."
        if field["nitrogen"] < 30
        else "Monitor during the next soil review."
    )
    return dict(
        plan=plan,
        events=events,
        steps=[dict(event=e, checkpoint=data["checkpoints"][e["category"]]) for e in events],
        forecast=forecast,
        comparison=[
            dict(name="Crop health", current=health, projected=projected),
            dict(name="Soil moisture", current=moisture, projected=55),
        ],
        technicals=technicals,
        contingencies=data["contingencies"],
    )
