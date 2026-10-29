def notifications(fields):
    return [
        dict(
            id=f"field-{field['id']}",
            kind="field",
            severity="error" if field["status"] == "Critical" else "warning",
            fieldId=field["id"],
            fieldName=field["name"],
            title="{{value0}} needs a little care",
            description="Nitrogen has dropped below the healthy range. Plan a nutrient top-up soon."
            if field["nitrogen"] < 20
            else "Soil moisture is low. Check your irrigation schedule.",
        )
        for field in fields
        if field["status"] != "Healthy"
    ] + [
        dict(
            id="weather-rain",
            kind="weather",
            severity="info",
            title="Light rain expected Thursday",
            description="A good window to plan nutrient applications.",
        )
    ]
