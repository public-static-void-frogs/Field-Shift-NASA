"""Field properties, illustrative history, and recommendations."""

from datetime import datetime

from app.data import fixture


def properties(field):
    seeds = fixture("fields")
    soil = seeds["properties"][str(field["id"])]
    original = next(
        (item["crop"] for item in seeds["fields"] if item["id"] == field["id"]), "Soybeans"
    )
    crop = soil
    if field["crop"] != original:
        template_id = {"Winter wheat": "1", "Corn": "2"}.get(field["crop"], "3")
        crop = seeds["properties"][template_id]
    return dict(
        soil=soil,
        crop=crop,
        growthStage={"Winter wheat": "Heading · BBCH 55", "Corn": "Vegetative · V6"}.get(
            field["crop"], "Vegetative · V3"
        ),
        lastSample="May 23, 2026 · 0–30 cm depth",
        cultivationPractice="Reduced tillage",
        tenure="Owner operated",
    )


def recommendation(field):
    name, crop = field["name"], field["crop"].lower()
    if field["status"] == "Healthy":
        return dict(
            title="Things are growing in the right direction.",
            description=f"{name} is in good shape. Soil moisture and nitrogen levels are supporting steady {crop} growth. Keep your current care routine and check again after Thursday’s expected rain.",
            nextStep="Check crop growth and soil moisture in 3 days.",
        )
    low = field["nitrogen"] < 20
    stress = "nitrogen deficiency" if low else "moisture stress"
    care = (
        "Plan a nitrogen top-up within the next 48 hours, ideally before the light rain on Thursday to help nutrients reach the roots."
        if low
        else "Check your irrigation schedule and give the soil a moderate watering before the warmer days ahead."
    )
    return dict(
        title="A little action now can make a big difference."
        if field["status"] == "Critical"
        else "Let’s give this field a little extra care.",
        description=f"{name} is showing signs of {stress}, which could slow your {crop} growth. {care}",
        nextStep="Schedule a soil check and nitrogen application."
        if low
        else "Check irrigation and soil moisture tomorrow.",
    )


def history(field):
    data = fixture("history")
    events = data["templates"]
    p = properties(field)["soil"]
    fid, name, crop = field["id"], field["name"], field["crop"]
    nitrogen, moisture, health = field["nitrogen"], field["moisture"], field["health"]
    crop_details = {
        "Winter wheat": ("September 20", "July 16", 6.8),
        "Corn": ("April 18", "October 8", 10.4),
        "Soybeans": ("April 24", "September 10", 3.6),
    }
    soil_conditions = [
        "Residues retained; cover established",
        "Organic matter improved",
        "Baseline soil survey completed",
    ]
    seasons = [
        dict(
            year=2026,
            crop=crop,
            planted=field["planted"],
            harvested="Growing season in progress",
            yield_="Not harvested",
            soilCondition="Low nitrogen; nutrient review due"
            if nitrogen < 20
            else "Soil structure maintained",
        )
    ]
    seasons[0]["yield"] = seasons[0].pop("yield_")
    for index, previous_crop in enumerate(data["previousCrops"][str(fid)]):
        year = 2025 - index
        planted, harvested, amount = crop_details[previous_crop]
        seasons.append(
            {
                "year": year,
                "crop": previous_crop,
                "planted": f"{planted}, {year - 1 if previous_crop == 'Winter wheat' else year}",
                "harvested": f"{harvested}, {year}",
                "yield": f"{amount + fid % 3 * 0.2 - index * 0.1:.1f} t/ha",
                "soilCondition": soil_conditions[index],
            }
        )
    needs_care = field["status"] != "Healthy"
    review = (
        f"{name} is showing steady growth. Moisture and nutrients are supporting the current crop."
    )
    if nitrogen < 20:
        review = f"Low nitrogen and dry topsoil were recorded in {name}. A nutrient application and irrigation review were added to the work plan."
    elif needs_care:
        review = (
            f"Drying soil was recorded in {name}. Irrigation scheduling was flagged for review."
        )
    events["current-review"].update(
        title="Field health review flagged a change"
        if needs_care
        else "Field health review completed",
        description=review,
        measurements=[
            f"Nitrogen {nitrogen} mg/kg",
            f"Moisture {moisture}%",
            f"Crop health {health}/100",
        ],
        attention=needs_care,
    )
    events["soil-sample"]["measurements"] = [
        f"pH {p['soilPh']:.1f}",
        f"Organic matter {p['organicMatter']:.1f}%",
        f"Phosphorus {p['phosphorus']} mg/kg",
    ]
    events["growth-check"].update(
        title=f"{crop} growth inspection",
        attention=health < 50,
        description="Uneven canopy and pale leaves were observed along the ridge. The affected area was marked for follow-up."
        if health < 50
        else events["growth-check"]["description"],
        measurements=[f"NDVI {p['vegetationIndex']:.2f}", f"Establishment {p['emergence']}%"],
    )
    events["recent-rain"]["measurements"] = [
        f"Rainfall {4.8 + fid * 0.6:.1f} mm",
        "Air temperature 19°C",
    ]
    if p["irrigation"] != "Rain-fed":
        events["water-review"].update(
            date=datetime.strptime(p["lastIrrigation"], "%B %d, %Y").date().isoformat(),
            title="Irrigation pass completed",
            description=f"Water was applied using the {p['irrigation'].lower()} system. Distribution and equipment pressure were checked.",
            measurements=["Application depth 14 mm"],
        )
    events["spring-soil"]["measurements"] = [
        f"Bulk density {p['bulkDensity']:.2f} g/cm³",
        f"Rooting depth {p['rootingDepth']} cm",
    ]
    events["nutrient-application"]["measurements"] = [
        f"Nitrogen applied {35 + fid * 5} kg/ha",
        "Even spread confirmed",
    ]
    if crop != "Winter wheat":
        events["winter-review"]["description"] = (
            "Crop residues protected the surface through winter. No substantial erosion channels were found."
        )
    events["autumn-test"]["measurements"] = [
        f"pH {p['soilPh'] + 0.1:.1f}",
        f"Organic matter {p['organicMatter'] - 0.1:.1f}%",
    ]
    previous = seasons[1]
    events["last-harvest"].update(
        date={"Corn": "2025-10-08", "Soybeans": "2025-09-10"}.get(previous["crop"], "2025-07-16"),
        title=f"{previous['crop']} harvest completed",
        measurements=[f"Harvest yield {previous['yield']}", f"Area {field['area']} ha"],
    )
    events["cover-management"]["measurements"] = [f"Drainage: {p['drainage'].lower()}"]
    events["previous-soil"]["measurements"] = [f"Organic matter {p['organicMatter'] - 0.2:.1f}%"]
    events["2024-harvest"].update(
        title=f"{seasons[2]['crop']} season closed",
        description=f"The {seasons[2]['crop'].lower()} season was closed with harvest records and a soil condition assessment. A different crop was selected for the following year.",
        measurements=[f"Harvest yield {seasons[2]['yield']}"],
    )
    events["2023-harvest"].update(
        title=f"{seasons[3]['crop']} harvest archived",
        measurements=[f"Harvest yield {seasons[3]['yield']}"],
    )
    events["baseline"].update(
        description=f"{name} was surveyed for soil texture, slope, and drainage. This assessment established the first reference point for long-term soil monitoring.",
        measurements=[
            p["soilType"],
            f"Slope {p['slope']:.1f}%",
            f"Organic matter {p['organicMatter'] - 0.4:.1f}%",
        ],
    )
    events["current-planting"].update(
        date=datetime.strptime(field["planted"], "%B %d, %Y").date().isoformat(),
        title=f"{crop} planted for the 2026 season",
        description=f"The field transitioned from {previous['crop'].lower()} to {crop.lower()}. Seedbed preparation and sowing were completed across the field.",
        measurements=[f"Planted area {field['area']} ha", "Reduced-tillage establishment"],
    )
    return dict(
        events=sorted(events.values(), key=lambda e: e["date"], reverse=True), seasons=seasons
    )
