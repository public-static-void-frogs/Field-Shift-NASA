import type { Feature } from 'geojson';
import type { FieldGeoJson } from '../../../types/maps/map.types.ts';

/** Geographic bounds in Leaflet's [latitude, longitude] order. */
export function getGeoJsonBounds(
  geojson: FieldGeoJson,
): [[number, number], [number, number]] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of geojson.features) {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [longitude, latitude] of ring) {
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            continue;
          }
          west = Math.min(west, longitude);
          south = Math.min(south, latitude);
          east = Math.max(east, longitude);
          north = Math.max(north, latitude);
        }
      }
    }
  }
  return Number.isFinite(west)
    ? [
        [south, west],
        [north, east],
      ]
    : null;
}

export function getFeatureFieldId(feature: Feature): number | undefined {
  const value = feature.properties?.fieldId ?? feature.id;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
