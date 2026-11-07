# Persistent fields

`fields` is the shared catalog. `user_fields` links accounts to catalog entries using
the composite primary key `(user_id, field_id)`. Both foreign keys cascade when the
referenced row is deleted. A catalog field can be selected by many users.

All endpoints below require the existing session cookie:

| Request | Behavior |
| --- | --- |
| `GET /api/v1/fields/catalog` | Browse catalog fields, including unselected fields (default 100; limit up to 500; offset) |
| `GET /api/v1/fields` | List only the signed-in user's selections |
| `POST /api/v1/fields` | Create a catalog entry and select it in one transaction; returns 201 |
| `PUT /api/v1/fields/{id}/selection` | Select an existing catalog field; idempotent, returns 200 |
| `DELETE /api/v1/fields/{id}` | Remove only the caller's selection; returns the UUID |
| `GET /api/v1/fields/{id}` | Read a selected field; returns 404 if not selected |

Manual creation requires `name`, `crop`, `area` (hectares), and GeoJSON `geometry`.
`parcelId` is an optional positive integer and is unique across the catalog when
provided. Duplicate parcel IDs return 409. Unknown catalog IDs return 404.
Invalid payloads return 422. Crop choices remain Winter wheat, Corn, and Soybeans.

```json
{
  "name": "West Orchard",
  "crop": "Soybeans",
  "area": 12.5,
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[30.5, 50.4], [30.51, 50.4], [30.51, 50.41], [30.5, 50.4]]]
  }
}
```

Imported CSB fields can have a null crop and include `sourceId`, `boundaryKind`,
`sourceYear`, county and FIPS metadata. Their rectangles are explicitly estimates.
See the [real-source map](field-map-prototype.md) for ingestion and spatial loading.

`planted` (ISO date), `properties`, health, moisture, nitrogen and status are
optional user-supplied data. Missing values return null; creation never invents
soil measurements, health, planting dates, history, recommendations or plans.
Properties support partial soil/crop measurements. Crop weather assessments need
soilType, soilPh, organicMatter, waterCapacity and drainage; missing inputs return
422. Weather uses the selected field boundary and the caller's saved time zone.

Field responses no longer include the former fixture-only `farmId` and `cropId`.
Map feature IDs are field UUIDs, `parcelId` can be null, and `catalogFieldId`
identifies entries even when `fieldId` is null for an unselected field.
Clients must handle nullable field measurements and properties.

Catalog entries, including manually created entries, are visible to authenticated
users so they can select them. Personal settings remain private. Maps show catalog
boundaries and mark only the caller's selected fields. Removing a selection does
not delete shared data or affect another user.

Run `alembic upgrade head` before starting the updated backend. The migration
creates empty tables and does not import demo fixtures. Existing SQL accounts and
settings are preserved. The old `{parcelId, name, crop}` create payload requires
the client to supply area and boundary, or select a catalog entry by its UUID.

History, schedules, notifications, help fixtures and chart observations are empty
until real data is available. Properties, recommendation and strategy resources
return 404 when unavailable. The planning date uses the caller's current local
date. No production JSON fixture repository is loaded.

## Explicit temporary UI samples

On 2026-10-31, sample crop and soil values were explicitly requested for the local
prototype. `scripts/seed_field_samples.py` fills missing crop/soil inputs on
currently selected fields only. It is never run automatically and does not change
source geometry, selection membership, sensor readings, or the remaining catalog.
The first two selected fields received Corn/Silt loam and Soybeans/Clay loam.
Soil pH, organic matter, water capacity and drainage are synthetic inputs sufficient
for the existing field-specific weather assessment contract, not measured data.

```sh
python scripts/seed_field_samples.py
python scripts/seed_field_samples.py --restore
```

Original values and sample provenance are stored separately in
`map_datasets`, under `prototype-field-types`. Repeating the seed is idempotent.
Restoration only reverts sample values that have not since been replaced; newer
values are preserved. The restore path was exercised in a rolled-back savepoint.
The local `/fields` and both field-properties endpoints returned HTTP 200, and
crop/soil inputs passed the backend assessment preconditions. This does not verify
live weather-provider availability or agronomic accuracy.
