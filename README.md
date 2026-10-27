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

## Project structure

```text
src/
  app/           Application providers, route rendering, shared state, and theme
  components/    Shared UI grouped by fields, map, weather, layout, and common UI
  data/          Frontend field, parcel, weather, and recommendation data
  hooks/         Farm state access and hash-based page navigation
  pages/         Dedicated screens for each route
  styles/        Global, application layout, and dashboard styles
  types/         Shared domain and navigation types
  main.tsx       Application entry point
```

Field details use dedicated routes such as `#/fields/4`. Adding fields uses
`#/map/add` and `#/map/add/6`. Navigation supports direct links, refresh, and
browser back/forward without server routing configuration. Settings, help,
and notifications also have their own pages. Removal uses an inline confirmation.
The app does not use modals.

Typography and library colors are centralized in `src/app/theme.ts`: body text
is 16px, supporting text is 14px, and controls are 42px tall. Custom CSS is limited
to layout, map overlays, and the existing green and cream visual treatment.
The `.editorconfig` file defines two-space indentation and consistent line endings.
Field agronomy profiles and land history are defined in `src/data/fieldProperties.ts`
and `src/data/landHistory.ts`. Status tags use explicit semantic foreground and
background colors in the shared theme for readable contrast.
Hardcoded spatial health profiles live in `src/data/fieldHealth.ts`. The heatmap
interpolates these local values into a continuous overlay. The field-detail health
illustration still uses the original local parcel geometry; Overview and Field map
use geographic GeoJSON and real satellite imagery.

## Explore

- **Overview:** farm totals, selectable field map, crop health, weather outlook, and field recommendations.
- **Field map:** pan, zoom, recenter, switch layers, select a field, or add an available parcel.
- **My fields:** search and filter fields by crop or health status. Each field page starts with a red-to-green health heatmap clipped to its parcel boundary, selectable inspection zones, an overlay toggle, zoom/pan controls, and an area breakdown. Below it are plain-language health indicators, a simulated generated summary, and full-width crop, soil, and land/water properties. Each field includes notes, removal controls, and a land history with searchable activity records, year/category filters, and a crop-rotation table for 2023–2026.
- **Calendar:** an Ant Design month/year calendar with field and action filters, a compact selected-day agenda, and a searchable table. Primary action buttons open dedicated detail pages with scheduling, rationale, and current field conditions. Date selection preserves the page scroll position.
- **Environment history:** current conditions, trend charts, and 7-, 30-, or 90-day weather logs.

All values and recommendations are defined in the frontend. Field changes and notes live in React state and reset on refresh. No backend, credentials, or AI services are required. Map imagery requires internet access to the Esri tile service.

## Offline dependency packages

`vendor/` contains npm package archives copied from locally installed packages because the package registry was unavailable during setup. `package.json` and the lockfile use these archives for Ant Design, Lucide, and their dependencies, keeping the project self-contained. Keep this directory when sharing the source.

## Crop rotation and system planning

Field pages feature a prominent crop rotation suggestion with a two-season outlook,
confidence, supporting field stats, and a calculated planting window. Dates link to
`#/calendar/YYYY-MM-DD` with optional field/event filters. Action details use
`#/calendar/actions/:eventId`.

Planning fixtures live in `src/data/planning.ts`; planting date adjustments use the
fixed soil pH and moisture values through `src/utils/planningDates.ts`. ML predictions,
confidence, rationale, and system schedules are frontend fixtures. The planning clock
is fixed to May 24, 2026 to match the rest of the growing-season demo.

```sh
npm run test:planning
```

## Geographic maps

Overview and Field map share `src/components/map/FieldMap.tsx`, using Leaflet and
React Leaflet. The satellite basemap is Esri World Imagery; the source and required
attribution are configured in `src/data/fieldGeoJson.ts`. Labels, zoom buttons,
recenter, overlay selector, and field/add-parcel navigation remain available.
The scale now follows the map zoom. Overlay health/moisture readings remain demo data.

`FieldMap` accepts a `geojson` prop typed as `FieldGeoJson` (defined in
`src/types/map.ts`): a WGS84 `FeatureCollection` of `Polygon` or `MultiPolygon`
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
  onSelect={field => navigate(`/fields/${field.id}`)}
  onAdd={id => navigate(`/map/add/${id}`)}
/>
```

```sh
npm run test:maps
```
