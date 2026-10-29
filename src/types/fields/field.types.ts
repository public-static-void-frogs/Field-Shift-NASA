import type { Polygon, MultiPolygon } from 'geojson';
import type { FieldPropertyData } from './api.types.ts';

export type FieldStatus = 'Healthy' | 'Needs attention' | 'Critical';

export interface Field {
  id: string;
  parcelId: number;
  farmId: string;
  cropId: string;
  geometry: Polygon | MultiPolygon;
  properties: FieldPropertyData;
  name: string;
  crop: string;
  area: number;
  health: number;
  moisture: number;
  nitrogen: number;
  status: FieldStatus;
  planted: string;
}
