# Weather integration

The backend fetches Open-Meteo model data using the signed-in account's saved
latitude, longitude, time zone, and metric/imperial preferences. It never selects
the demo farm's station, falls back to a hardcoded location, or returns demo weather.
Accounts without coordinates receive 422; the UI links to Settings to select a point.

## API contract

FastAPI schemas in `app/schemas/weather.py` are the source of truth. Regenerate
`openapi.json` from `app.main.app.openapi()` after contract changes.

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/weather/current` | Current model conditions and five upcoming daily summaries |
| `GET /api/v1/weather/forecast` | Fourteen daily forecasts starting today, oldest first |
| `GET /api/v1/weather/history?days=7` | Completed historical daily estimates, newest first; 7, 30, or 90 days |
| `GET /api/v1/weather/history?start_date=2025-07-01&end_date=2025-07-07` | Explicit historical period, up to 366 inclusive days, from 1940 through yesterday |

All endpoints require the existing session cookie. Dates in records are ISO calendar
dates in the saved time zone. `observedAt` is the validity time of current conditions,
not a station observation. `fetchedAt` is the upstream retrieval time and remains
unchanged on a cache hit. Metadata includes requested coordinates, actual grid
coordinates, units, source, time zone, soil depth, and data kind.

Forecast and history responses wrap `records` in metadata. A daily temperature is
the high; `low` is the minimum. Wind is the daily maximum, humidity is the mean of
available hourly values, and precipitation includes rain and snow. `rainChance` is
the daily maximum precipitation probability, unavailable for historical data.
Missing provider readings stay `null`; they are not replaced by zero or interpolated
by the app. Historic and forecast datasets must not be treated as field sensors.

Soil moisture is volumetric water content, converted from m³/m³ to percent. The
forecast source is 0–1 cm; the archive source is 0–7 cm. These depths are displayed
in day details and explained in source metadata. They are deliberately shown in
separate timelines rather than joined into one continuous soil series. Near-term
archive values may be incomplete. Long-term climate studies should select a fixed
reanalysis dataset rather than assume the default archive is homogeneous.

## Fetching and performance

`WeatherService` owns the provider adapter, pooled HTTP client, validation,
aggregation, and a bounded per-process LRU/TTL cache. Current weather and forecast
use the identical upstream request and share a ten-minute cache. Historical requests
use a six-hour cache. Concurrent identical misses share one in-flight result.
Cache identities include endpoint, coordinates, units, time zone, and dates; user
labels are added after retrieval, so a cached location name cannot leak between users.
There is no expired-cache or demo fallback. Timeouts, rate limits, HTTP errors and
malformed successful payloads become 503, without exposing upstream exception details.

The frontend uses parameterized React Query keys and cancellation, clears weather
queries when settings change, and shares forecast queries among Environment,
strategy and notification views. Current/forecast queries poll every ten minutes
while active; history is fresh for thirty minutes. Errors stay inside their weather
panel. Historical loading and forecast loading are independent.

The cache is local to each API worker and lost on restart. A multi-worker deployment
can add a shared cache without changing the DTOs. Do not use cached `fetchedAt` as a
provider model-run initialization timestamp; the service does not expose that time.

Default upstream URLs can be overridden with `WEATHER_FORECAST_URL` and
`WEATHER_ARCHIVE_URL` for a local simulation or a different Open-Meteo deployment.
The hosted free Open-Meteo endpoint is for noncommercial use under its usage limits;
commercial deployment requires an appropriate service plan or self-hosting. Preserve
Open-Meteo attribution and upstream data licensing.

## UI and cleanup

Environment preserves the underlined metric tabs, shows current conditions separately
from a clickable fourteen-day calendar and forecast trend, and exposes past conditions,
custom date ranges, and an always-visible paginated daily log. Colors encode readings,
not crop-specific safety thresholds. Cold temperatures are blue and warmth is amber/red.
The location appears once in the page header. Unsupported measurements display a dash.

Removed: current/history/forecast/station weather fixtures, the station foreign key,
the fixed Thursday rain notification, embedded claims of upcoming Thursday rain, and
simulated strategy soil-moisture forecasts. Crop health, nutrient data, and rotation
recommendations remain explicitly illustrative; weather does not validate those models.
Notification weather outlooks derive from the next three days of live forecasts:
freezing lows, wind at least 40 km/h, or precipitation probability at least 60%.
They are not official warnings and missing values are not assessed.

## Verification

Run backend tests:

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/ruff check app tests
```

Run a local Postman simulation (CLI 1.74.0 was used):

```sh
postman simulation run postman/simulations/weather.sim.yaml --port 4407 --no-history --output ndjson
WEATHER_SIMULATION_URL=http://127.0.0.1:4407/open-meteo .venv/bin/python -m unittest discover -s tests -p 'test_weather_simulation.py' -v
```

The test-only stand-in follows Open-Meteo variable names and response shapes. It
supports success, null readings, 429, 503, malformed JSON shapes, and delayed responses.
The tests execute the real FastAPI routes and real HTTP client; mock values never
enter application runtime. No provider-owned Postman mock was reused or published.
The context document records the scope of evidence and live-provider limitations.

Official contracts: https://open-meteo.com/en/docs and
https://open-meteo.com/en/docs/historical-weather-api.
