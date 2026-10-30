# Weather integration

The backend fetches Open-Meteo model data using the signed-in account's saved
latitude, longitude, time zone, and metric/imperial preferences for unscoped requests.
An explicit `field_id` on forecast/history instead selects that field's geometry bounding-box
center and its farm time zone, retaining the account's unit preference. Weather remains
live provider data; the selected demo field's crop and soil are illustrative inputs.
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

## Crop-condition contract

`GET /weather/forecast?field_id=<UUID>` and `GET /weather/history?...&field_id=<UUID>`
return the same weather envelope with additional crop assessments. The authenticated
field must exist: malformed UUIDs return 422, missing fields return 404, and both are
checked before contacting the provider. The field's location can supply coordinates
even if account coordinates are unset. Omitting `field_id` preserves saved-location
behavior, with `cropAssessment: null` in the series and daily records. Current weather
remains unscoped. No field is implicitly chosen by the server.

FastAPI schemas in `app/schemas/crop_conditions.py` and the frontend DTOs in
`src/types/weather/weather.types.ts` define:

- Series `cropAssessment.model`: identifier, version, `kind` (`heuristic_stub` or
  `ml_model`), and `scoreMeaning: suitability_0_bad_100_good`.
- Series `cropAssessment.context`: selected field/crop, requested coordinates,
  soil type/pH/organic matter/water capacity/drainage, and weather-window summary.
  Climate `source` explicitly identifies a forecast or historical window; these
  features are **not long-term climate normals**. Summary values use response units.
- Series `cropAssessment.bounds`: all five metrics, each with `unit`, nullable
  `criticalLow` / `criticalHigh`, `goodLow`, `ideal`, and `goodHigh`. The ideal lies
  inside the inclusive good interval. Critical limits lie strictly outside it.
- Record `cropAssessment`: `suitabilityScore` (0 poor, 100 good; null if no inputs),
  `riskLevel` (`good`, `caution`, `high`, `unknown`), `coverage` (`complete`, `partial`,
  `unavailable`), all five `metrics`, and `alerts`.
- Each metric returns aggregate `riskLevel`, primary `valueRiskLevel`, optional
  temperature `lowRiskLevel`, and `suitabilityScore`. Daytime high and overnight low
  are evaluated separately. A mild daytime high does not conceal a freezing night.
- Alerts carry `metric`, `reading` (`value` or `low`), `severity`, `code`
  (`below_critical`, `below_good`, `above_good`, `above_critical`), measured `value`,
  breached `boundary`, and `unit`. The frontend translates these structured reasons.

Values at or beyond a critical limit are high risk. Values outside the good interval
but inside critical limits are caution. Missing readings are unknown, never zero or
safe. Overall risk is the highest available risk; absent inputs prevent an otherwise
all-good day being called good. Overall score is the worst available metric score,
so averaging cannot hide a severe condition. Coverage qualifies partial scores.

`HeuristicCropConditionModel.predict(series, context)` implements the replaceable
`CropConditionModel` interface, configured as `app.state.crop_model`. It uses crop-specific
illustrative temperature priors, soil texture/water buffering and drainage, and a bounded
weather-window temperature adjustment. It normalizes calculations to Celsius/mm/km/h,
then converts every returned limit and alert to response units. Dry daily rainfall alone
is not drought: lower rainfall has no critical limit. Shallow model soil moisture is a
proxy, with different forecast/archive depths; the thresholds are not calibrated.

Replace this object with a trained predictor returning the same validated schema,
set `kind: ml_model`, and supply its own model ID/version. No frontend threshold or
risk algorithm needs replacing. Raw provider weather retains its existing cache;
assessment is computed afterward using the requested field, and never mutates or
caches a field assessment inside the provider response.

## UI

Environment starts with metric tabs and an explicit field selector (the first listed
field is the initial UI selection). Forecast and history cache keys include `field_id`;
field changes invalidate weather caches. Both charts render backend good/caution/high
zones and critical/ideal lines, coloured points and numeric labels. Temperature low
values have their own dotted line and warning labels. Long timelines show selected
point labels and keep other values available in tooltips; narrow screens scroll the
chart horizontally. ⚠️ icons on day cards and selected-day details use backend daily
alerts, including warnings from other metrics. The large reading keeps a stable slate
colour, and its animated weather scene remains independent from crop risk.

The interface identifies the heuristic as a prototype, displays the field/crop/soil
basis, reports score meaning and missing-input coverage, and retains provider source
metadata. It never presents the heuristic as a trained or calibrated model.

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
