import type { Feature, FeatureCollection, Point } from 'geojson';

export interface FieldMapProperties {
  fieldId?: string | null;
  catalogFieldId?: string;
  parcelId?: number | null;
  name?: string;
}

export type FieldGeoJson = FeatureCollection<Point, FieldMapProperties | null>;
export type MapBounds = [number, number, number, number];

export interface CatalogMapProperties extends FieldMapProperties {
  kind: 'field' | 'cluster';
  count?: number;
  area: number;
  bounds?: MapBounds;
  sourceId?: string;
  crop?: string | null;
  locationKind?: 'user_point' | 'interior_point';
}

export type CatalogFeature = Feature<Point, CatalogMapProperties>;

export interface CatalogMapView {
  type: 'FeatureCollection';
  mode: 'clusters' | 'fields';
  bounds: MapBounds;
  total: number;
  features: CatalogFeature[];
  limit: number;
  source: string;
  approximate: boolean;
}

export interface MapSummary {
  total: number;
  bounds: MapBounds | null;
  defaultCenter: [number, number];
  defaultZoom: number;
  source: string;
  locationKind: string;
  importedAt: string | null;
  status: string;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
}
