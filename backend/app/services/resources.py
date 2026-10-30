"""Join farm ownership, help records, and map boundaries."""


def farm_profile(store, user):
    from app.schemas.auth import SettingsInput

    farm = store.all("farms")[0]
    preferences = SettingsInput.model_validate(user.settings).model_dump(by_alias=True)
    return dict(
        preferences,
        availableSeasons=farm["availableSeasons"],
        fullName=user.full_name,
        initials="".join(part[0] for part in user.full_name.split()[:2]).upper(),
        email=user.email,
        role="Farm owner",
        locationLabel=user.settings.location,
    )


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
