# FrogFarmers

A frontend crop field management dashboard built with React, TypeScript, Vite, Ant Design, and Lucide icons.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

```sh
npm run build
npm run preview
```

## Formatting

Run `npm run format` to apply Oxlint fixes, component spacing rules, and Prettier,
or `npm run format:check` to verify them. Control-flow bodies always use braces,
including single-line `if` statements. Leave a blank line after imports and before
JSX returns following hooks or other logic. Oxlint enforces braces;
`scripts/code-spacing.mjs` enforces these blank lines because Prettier has no options
for either convention. The shared Prettier configuration uses single quotes and a
100-column print width. Generated output, vendored dependencies, and the npm lockfile
are excluded.

## Project structure

```text
src/
  api/           Feature API methods, query keys/options, mutations, and mock implementations
  app/           Application providers, route rendering, and theme
  components/    Common UI shared across unrelated features
  features/      Feature components, hooks, utilities, and constants
  hooks/         Shared hooks for farm resources and chart behavior
  pages/         Dedicated screens for each route
  styles/        Global, application layout, and dashboard styles
  types/         API models, component props, and shared types grouped by feature
  utils/         General formatting, pagination, and pointer helpers
  main.tsx       Application entry point
```

Feature UI lives alongside its behavior:

```text
features/
  maps/
    components/
      FieldMap.tsx
      FieldMap.css
      MapCard.tsx
    hooks/
    utils/
    constants/
      maps.constants.ts
```

Calendar components belong to `features/planning/components`; field, weather,
overview, help, and layout components follow the same pattern. Only shared UI
such as router buttons, headings, and error boundaries stays in `components/common`.

Components focus on rendering, translations, queries, and feature hooks. Substantial state and
effects live in `src/features/<feature>/hooks`; pure feature functions live in the adjacent
`utils` folder. Keep simple component logic inline when extracting it would add little value.
Use explicit branches or mappings instead of nested ternaries. Extract large conditional JSX branches into named subcomponents
declared below the main component in the same file; keep the branch itself to a
`return <Subcomponent />`. These rules are recorded in
`AGENTS.md`, and the test suite checks for nested ternaries across the source tree.

Field details use dedicated routes such as `/fields/4`. Adding fields uses
`/map/add` and `/map/add/6`. Navigation supports direct links, refresh, and
browser back/forward through React Router. Production hosting must serve `index.html`
for application paths (for example `/fields/4`) so direct links and refreshes work. Settings, help,
and notifications also have their own pages. Removal uses an inline confirmation.
The app does not use modals.

Typography and library colors are centralized in `src/app/theme.ts`: body text
is 16px, supporting text is 14px, and controls are 42px tall. Custom CSS is limited
to layout, map overlays, and the existing green and cream visual treatment.
The `.editorconfig` file defines two-space indentation and consistent line endings.
Field agronomy profiles and land history are defined in `src/api/fields/mocks/properties.mock.ts`
and `src/api/fields/mocks/history.mock.ts`. Status tags use explicit semantic foreground and
background colors in the shared theme for readable contrast.

## Explore

- **Overview:** farm totals, selectable field map, crop health, weather outlook, and field recommendations.
- **Field map:** pan, zoom, recenter, switch layers, select a field, or add an available parcel.
- **My fields:** search and filter fields by crop or health status. Each field page starts with a real satellite map focused on that field’s GeoJSON boundary. Below it are the rotation plan, an AI-style explanation with a blue-purple gradient border, crop/soil/water properties, and searchable land history. Field management and removal controls are at the bottom. The detail map has no heatmap or metric overlay controls.
- **Calendar:** an Ant Design month/year calendar with field and action filters, a compact selected-day agenda, and a searchable table. Primary action buttons open dedicated detail pages with scheduling, rationale, and current field conditions. Date selection preserves the page scroll position.
- **Environment history:** current conditions, trend charts, and 7-, 30-, or 90-day weather logs.

All values and recommendations are defined in the frontend. Field changes live in the in-memory mock service and reset on refresh. React Query caches server resources and invalidates dependent queries after mutations. No backend, credentials, or AI services are required. Map imagery requires internet access to the Esri tile service.

## Offline dependency packages

`vendor/` contains npm package archives copied from locally installed packages because the package registry was unavailable during setup. `package.json` and the lockfile use these archives for Ant Design, Lucide, and their dependencies, keeping the project self-contained. Keep this directory when sharing the source.

## Crop rotation and system planning

Field pages feature a compact rotation summary and planting window linking to
`/fields/:id/strategy`. The strategy page includes step-by-step actions, technical
inputs, conditional recommendations, and interactive illustrative forecast charts.
Dates link to
`/calendar/YYYY-MM-DD` with optional field/event filters. Action details use
`/calendar/actions/:eventId`.

The entire field schedule supports Accept all and Reject all on the strategy page,
calendar drawer, and action details. Accepted events remain confirmed; rejected events are
hidden from the calendar but remain editable on the strategy page. Responses persist
in browser localStorage and reset to proposed when event instructions change.

Planning fixtures live in `src/api/planning/mocks/planning.mock.ts`; planting date adjustments use the
fixed soil pH and moisture values through `src/api/planning/mocks/agronomy.mock.ts`. ML predictions,
confidence, rationale, and system schedules are frontend fixtures. The planning clock
is fixed to May 24, 2026 to match the rest of the growing-season demo.

```sh
npm run test:planning
npm run test:strategy
```

## Geographic maps

Overview, Field map, and field-detail pages share `src/features/maps/components/FieldMap.tsx`, using Leaflet and
React Leaflet. The satellite basemap is Esri World Imagery; the source and required
attribution are configured in `src/features/maps/constants/maps.constants.ts`. Labels, zoom buttons,
recenter, overlay selector, and field/add-parcel navigation remain available.
The scale now follows the map zoom. Overlay health/moisture readings remain demo data.

`FieldMap` accepts a `geojson` prop typed as `FieldGeoJson` (defined in
`src/types/maps/map.types.ts`): a WGS84 `FeatureCollection` of `Polygon` or `MultiPolygon`
features. Coordinates use standard GeoJSON `[longitude, latitude]` order.
`properties.fieldId`, or a numeric `feature.id`, associates a polygon with a field.
An unmatched ID keeps the parcel available to add; a feature without an ID is
rendered without navigating to an add form. Optional `properties.name` labels
unmatched features. Property and field names are rendered as text, not HTML.
Replacing the collection redraws the overlays and fits the map to its new bounds.

Both pages currently pass the exported `fieldGeoJson`: six hardcoded rectangular
sample parcels over farmland west of Ames, Iowa. These are illustrative boundaries,
not real land ownership or surveyed parcel boundaries. To use another dataset,
pass a different collection to the same component:

```tsx
<FieldMap
  geojson={yourFeatureCollection}
  fields={fields}
  adding={false}
  onSelect={(field) => navigate(`/fields/${field.id}`)}
  onAdd={(id) => navigate(`/map/add/${id}`)}
/>
```

```sh
npm run test:maps
```

## Routing

React Router manages clean browser URLs with `createBrowserRouter`. Route definitions
and lazy page modules live in `src/app/routes.ts`; ID/date validation lives in
`src/app/route-loaders.ts`. The login route sits outside the farm layout, which
renders child pages through `Outlet`. Matched route metadata controls sidebar
selection and fullscreen workspaces.

Use `Link`, `NavLink`, or the Ant Design `RouterButton` integration for navigation
links; use `useNavigate` for operations such as opening a selected map parcel or
redirecting after a mutation. Pages read validated IDs with `useLoaderData` and
calendar parameters with `useParams` and `useSearchParams`. Do not pass navigation
functions through component props or write to `window.location.hash`.

`ScrollRestoration` handles browser history. Calendar date/filter changes use
`preventScrollReset` and retain their local view state. Unknown routes and invalid
IDs/dates render the localized not-found screen. Production hosts must rewrite
application URLs to `index.html`; Vite's dev and preview servers already provide
SPA history fallback. Static assets use root-relative paths.

React Query remains responsible for resource loading, caching, and mutations.
The router loaders validate URL parameters and do not create a second data cache.
Run `npm run test:router` for route matching, parameter validation, search state,
and browser-history behavior.

## Data access and caching

The data layer follows the sample Abitly project's separation of API methods,
query-key factories, reusable query options, and a shared query client. Features
include fields, farm profile, planning, maps, weather, overview analytics,
notifications, and help content.

```text
src/api/fields/
  fields.api.ts        Async typed API methods; the boundary for a future HTTP client
  fields.queries.ts    Stable fieldQueryKeys and reusable fieldQueries options
  fields.mutations.ts  Mutations and invalidation of dependent resources
  mocks/               Fixture records, generators, and the in-memory service store
src/types/fields/      Field models, request/response types, and component/page props
```

Components consume query options with `useSuspenseQuery` or `useSuspenseQueries`.
The `useFarm` hook combines shared farm resources and mutations from the same cache;
it does not own fixture state. The query client is created once per app root with a
60-second stale time. Suspense handles loading, and a query error boundary provides
a translated retry action. Add/remove and strategy-response controls wait for
mutations and report write failures.

Key factories include every server-side query parameter (field IDs, weather
ranges, trend ranges, and metrics). Field mutations invalidate field resources,
planning, overview charts, and notifications. Strategy responses update and
invalidate their shared response query. Removing a field also removes its saved
event responses. Filtering and other temporary UI state remain in components.

The service currently uses asynchronous local mocks and returns cloned plain-data
responses. Fixtures, sample weather, account details, help records, generated
strategies, and the demo planning date all come from this layer. There is no HTTP
API or live server integration. Mock requests use `networkMode: 'always'` so the
local demo works offline; map tiles still require internet access. To connect a
real backend, replace the feature `.api.ts` implementations while preserving their
request/response types and query keys, then use online network mode in the query
client. No component should import from an API `mocks/` folder.

Run `npm test` for all checks of domain behavior, translations, and queries, or
`npm run test:queries` for cache deduplication, key separation, mutation
invalidation, response persistence, failure recovery, and architecture boundaries.

## UI languages

The app uses react-i18next with English as the default fallback and Ukrainian as the second locale. On first use it follows the browser’s preferred supported language (`en` or `uk`, including regional variants). The language selector in Settings applies immediately and saves the choice in local storage under `frogfarmers.language`; that choice takes precedence on later visits.

UI strings live in `src/i18n/locales/en.json` and `src/i18n/locales/uk.json`. Each JSON catalog is loaded through a dynamic import, so Ukrainian is only downloaded when needed. English also loads as the fallback. Ant Design controls, calendar dates, the document language, and page metadata follow the selected language. Demo field data, user-entered values, and sample recommendation content stay unchanged.

Use `useTranslation()` and `t()` for new UI text. Keys are English phrases with key and namespace separators disabled; keep complete sentences together and use interpolation for variable values. Add matching keys and interpolation variables to both catalogs. Run `npm run test:i18n` to check catalog consistency, language detection, saved preferences, and lazy loading.
