"""Join farm ownership, weather observations, help records, and map boundaries."""


def farm_profile(store):
    farm = store.all("farms")[0]
    owner = store.require("users", farm["ownerId"])
    return dict(owner, **{k: v for k, v in farm.items() if k != "id"}, farmName=farm["name"])


def current_weather(store):
    farm = store.all("farms")[0]
    current = store.related("current_weather", "stationId", farm["weatherStationId"])[0]
    return dict(
        current,
        location=store.require("weather_stations", current["stationId"])["name"],
        forecast=store.related("weather_forecasts", "weatherId", current["id"]),
    )


def weather_history(store, days):
    farm = store.all("farms")[0]
    return sorted(
        store.related("weather_history", "stationId", farm["weatherStationId"]),
        key=lambda row: row["key"],
    )[:days]


def geojson(store):
    fields = {field["parcelId"]: field for field in store.all("fields")}
    features = []
    for parcel in store.all("parcels"):
        field = fields.get(parcel["id"])
        features.append(
            dict(
                type="Feature",
                id=parcel["id"],
                geometry=field["geometry"] if field else parcel["geometry"],
                properties=dict(
                    parcelId=parcel["id"],
                    fieldId=field["id"] if field else None,
                    name=field["name"] if field else parcel["name"],
                ),
            )
        )
    return dict(type="FeatureCollection", features=features)


def notifications(store):
    rows = []
    for row in store.all("notifications"):
        if row.get("fieldId"):
            row["fieldName"] = store.require_field(row["fieldId"])["name"]
        rows.append(row)
    return rows
