# Field Shift NASA backend

FastAPI demo API for `../../nasa-fields-demo-app`. Python 3.10+ is required.
All demo/domain data formerly held in the frontend API mocks is owned here.

## Run locally

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

The server listens on `http://127.0.0.1:8000`. Start the frontend separately with
`npm run dev`; Vite forwards `/api/*` to this backend. Its preview server uses the
same proxy. For separate hosting, build the frontend with `VITE_API_BASE_URL`
set to the full API prefix, e.g. `https://api.example.com/api/v1`.

`CORS_ORIGINS` accepts a comma-separated list of frontend origins. Its default is
`http://localhost:5173,http://127.0.0.1:5173`. Set it explicitly for deployed clients.

## Organization

```text
app/
  main.py          App factory, middleware, router registration
  api/             HTTP routes and injected repository dependency
  core/            Environment configuration
  schemas/         Pydantic request validation and response contracts
  repositories/    Process-local field and strategy-decision storage
  services/        Field history, recommendations, planning, analytics, notifications
  data/            Read-only JSON demo fixtures and copy templates by domain
main.py            Compatibility entry point
openapi.json       Generated API contract (source of truth: routes and Pydantic models)
tests/             API lifecycle, validation, concurrency, CORS, and planning checks
```

Routes delegate to services and the repository; they contain no fixture generators.
Read-only fixture files are cached and copied before use. Repository mutations are
protected by a lock, and callers receive detached values. Use `create_app()` to get
an isolated repository in tests. A database-backed repository can replace this demo
storage without changing frontend fetching or query keys.

## API contract

Interactive docs: [Swagger UI](http://127.0.0.1:8000/docs).
Live schema: [OpenAPI](http://127.0.0.1:8000/openapi.json).
All resource routes use `/api/v1`. The existing `GET /` health response is preserved.

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/fields` | List or create fields |
| GET, DELETE | `/fields/{id}` | Fetch or remove a field |
| GET | `/fields/{id}/properties`, `/history`, `/recommendation` | Field detail resources |
| GET | `/fields/{id}/events`, `/rotation`, `/strategy` | Field planning resources |
| PUT | `/fields/{id}/strategy/response` | Accept, decline, or reset the entire strategy |
| GET | `/crops`, `/parcels/{id}` | Crop choices and parcel details |
| GET | `/planning/context`, `/planning/events`, `/planning/responses` | Shared planning resources |
| GET | `/overview/charts?days=30&metric=health` | Trends and crop areas |
| GET | `/weather/current`, `/weather/history?days=30` | Current and historical demo weather |
| GET | `/farm/profile`, `/maps/geojson`, `/notifications` | Farm, boundaries, notifications |
| GET | `/help/team`, `/help/sources` | Help content |

Create a field with `{"parcelId":6,"name":"West Orchard","crop":"Soybeans"}`.
Names are trimmed and must contain 1–60 characters. Only the six demo parcels and
three supported crops are accepted. Success returns `201`; an occupied parcel
returns `409`. Missing fields/parcels return `404`. Invalid input returns `422`.
Errors use FastAPI's `{"detail": ...}` shape.

Respond to a strategy with `{"status":"accepted"}`, `{"status":"declined"}`, or
`{"status":"proposed"}`. The response contains all saved decisions, including
fingerprints compatible with the frontend calendar. Deleting a field also deletes
its decisions and updates derived schedules, analytics, and notifications.

Weather history accepts 7, 30, or 90 days. Chart ranges accept 1–365 days and
`health` or `moisture`. Defaults are 30 days and health.

## Demo storage limitations

No authentication, database, or external data feed is implemented. Seed data,
weather, boundaries, and agronomic projections remain illustrative. The planning
clock stays fixed at May 24, 2026. Changes survive frontend refreshes, are shared
by clients of the same process, and reset when it restarts. Run one worker for
this demo; multiple workers would have independent in-memory state. Browser-local
strategy decisions from the former frontend implementation are not imported.

## Verification

```sh
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
ruff check app tests main.py
ruff format --check app tests main.py
```

The frontend's `npm test` also starts isolated backend processes to exercise fetch,
query caching, mutation invalidation, strategy fingerprints, and maps over HTTP.
Run both suites after API changes.

Regenerate the checked-in contract from this directory after changing routes or schemas:

```sh
python -c 'import json; from pathlib import Path; from app.main import app; Path("openapi.json").write_text(json.dumps(app.openapi(), indent=2) + "\n")'
```
