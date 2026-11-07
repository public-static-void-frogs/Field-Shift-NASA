import type { Polygon, MultiPolygon } from 'geojson';
import type { FieldPropertyData } from './api.types.ts';

export type FieldStatus = 'Healthy' | 'Needs attention' | 'Critical';

export interface Field {
  id: string;
  parcelId: number | null;
  geometry: Polygon | MultiPolygon;
  properties: FieldPropertyData | null;
  name: string;
  crop: string | null;
  area: number;
  health: number | null;
  moisture: number | null;
  nitrogen: number | null;
  status: FieldStatus | null;
  planted: string | null;
  sourceId: string | null;
  boundaryKind: 'user_geometry' | 'estimated_bounds';
  sourceYear: number | null;
  county: string | null;
  stateFips: string | null;
  countyFips: string | null;
}
