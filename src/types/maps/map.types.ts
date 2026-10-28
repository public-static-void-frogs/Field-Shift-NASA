import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export interface FieldMapProperties {
  /** Associates a geographic feature with a field in the farm state. */
  fieldId?: number;
  name?: string;
}

export type FieldGeoJson = FeatureCollection<Polygon | MultiPolygon, FieldMapProperties | null>;
