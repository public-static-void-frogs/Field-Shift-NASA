# Real-source field map prototype

The source is the supplied `csb_bounds.zip` archive: 64 Parquet partitions containing
15,973,095 USDA NASS Crop Sequence Boundaries identities from the 2018–2025 edition.
The accompanying [source notes](../../research/data_sources/fields/NASS_CSB_with_bounds.md)
explain that these are **estimated rectangles derived from centroids and area**.
They are not surveyed or original polygon boundaries. The map labels that distinction.

## Reproduce the import

From `backend/`, with the existing local PostgreSQL database configured:

```sh
python -m pip install -r requirements-import.txt
alembic upgrade head
python scripts/import_csb_bounds.py /path/to/csb_bounds.zip
python main.py
```

The importer reads Parquet batches of 8,192 rows directly from each ZIP member.
It uses PostgreSQL COPY and commits one partition at a time, saving the completed
partition names and archive SHA-256 in `map_datasets`. Rerunning the same archive
resumes after the last committed partition; a completed archive is not duplicated.
A different archive checksum requires an explicit new-source/edition workflow.

Each source record goes into `fields`, with a deterministic UUID derived from its
edition and CSBID, unique `source_id`, original FIPS strings/county, source centroid,
area converted precisely from acres to hectares, and estimated extent. Original
latitude/longitude values are retained. Rectangles are generated only for the small
requested map view or an individual field; millions of redundant GeoJSON arrays
are not stored or sent to the browser. Source crop, soil, dates and health stay
unknown. No user selection is created by ingestion.

The importer builds a native PostgreSQL GiST index over
`box(point(min_lon,min_lat),point(max_lon,max_lat))`; PostGIS is not required.
It also builds count/area/extent cells at grid levels 4, 6, 8, 10 and 12. Each level
accounts for the complete imported catalog. User-created fields update those
cells atomically in the same transaction as creation.

Migration 0004 backfills extents for any existing user polygons. Downgrading to
the former non-null-polygon schema removes imported estimates, since the former
schema cannot represent them. Account settings and manually supplied polygons
are preserved by the upgrade.

## Map API

All routes require the existing session cookie.

- `GET /api/v1/maps/summary`: count, source, import status, extent and initial view.
- `GET /api/v1/maps/geojson?bbox=west,south,east,north&zoom=14`: at most 600 features.
- `GET /api/v1/fields/catalog?limit=100&offset=0`: bounded catalog browsing, maximum 500.
- `GET /api/v1/fields/catalog/{uuid}`: one field, without selecting it.
- `PUT /api/v1/fields/{uuid}/selection`: select an existing field idempotently.
- `DELETE /api/v1/fields/{uuid}`: remove the caller's selection, preserving the catalog.

Bounds and zoom are required. Invalid/reversed/non-finite extents return 422.
Cross-antimeridian views must be split; the prototype constrains the map to the
single world extent. There is no route that downloads the full source catalog.
The selected `/fields` list remains account-scoped.

At zooms below 11, or for a very wide requested extent, the endpoint selects
preaggregated cells. Close views query the spatial index with a hard 601-row probe.
If that probe exceeds the 600-feature rendering budget, the endpoint returns
complete groups at a coarser scale instead of truncating individual fields.
A high zoom paired with country-wide bounds still takes the overview path.
Cluster counts describe whole geographic cells intersecting the view, so they
can include fields just beyond its edges. They are not exact viewport totals.

Individual features include `catalogFieldId`; `fieldId` is present only for the
caller's selections. Cluster features contain a count, combined area and bounds
for zooming. No identity, preferences or choices from other accounts are returned.

## Frontend behavior

Start `../../nasa-fields-demo-app` with its normal `npm run dev`, then open `/map`.
The initial view focuses on Iowa. Click a count group to advance two zoom levels,
or navigate with dragging, the mouse wheel, touch gestures and the keyboard.
The scale is the only persistent map control. Close-up
rectangles open a source preview with area, county, CSBID and selection controls.
Selections appear in My fields and can be removed without deleting source data.

Requests follow `moveend`, debounced by 180 ms, and include rounded viewport bounds
and zoom in their React Query keys. Superseded reads receive cancellation signals.
Fresh views are reused for 60 seconds and unused map queries are collected after
2 minutes. Previous layers remain visible while the next area loads. Data arrival never refits the viewport. The current center and zoom are preserved
in URL query parameters, so refresh and browser Back restore the explored area. ResizeObserver keeps the
map aligned when the sidebar or available width changes.

Field rectangles use Leaflet Canvas. Only bounded groups use DOM markers.
The client consolidates nearby groups in world-anchored screen bins and merges
collisions until marker centers are at least 96 CSS pixels apart. Compact
40-pixel markers have no halos. Counts, area and source bounds are combined,
with space reserved for the scale and imagery attribution. Layout recalculates
on navigation and resizing, including while a replacement response is loading. Labels
are hover tooltips rather than thousands of permanent overlays. Group markers
are keyboard accessible. Heading, browse-list, bounds disclaimer and viewport-count
overlays are omitted; source quality remains available in the field preview.
Map errors provide retry controls. Desktop and phone layouts
use the same bounded API. English and Ukrainian strings are included.

Imported fields render explicit missing-data states in My fields and field details.
The detail mini-map reads the selected field directly, not a global map download.
Unavailable measurements do not become zero or an invented healthy status.

## Verification

```sh
python -m unittest discover -s tests -v
ruff check app tests migrations scripts main.py
ruff format --check app tests migrations scripts main.py
alembic check
python scripts/benchmark_map.py --base-url http://localhost:8000 --output docs/map-performance.json
```

The benchmark makes real local HTTP requests against PostgreSQL, with 30 samples
each for national, state, county, farm, source-example and outside-coverage views.
It records response size, feature count, p50/p95/max latency, actual imported row
count, cell totals and an EXPLAIN ANALYZE spatial plan. Its temporary account is
removed after the run. The saved [performance report](map-performance.json) contains
measured evidence; it should be regenerated after changing data, indexes or query behavior.

Backend regression tests cover extent validation, intersection filtering, selection
privacy, source identity/quality, manual creation updates, grouping without lost
counts, hard response budgets, catalog pagination, migration and restart behavior.
Frontend HTTP tests cover parameterized caches, deduplication, cancellation,
previous-view retention and selection/removal invalidation. Browser observations
and screenshots are recorded separately in [browser verification](map-browser-qa.md).
