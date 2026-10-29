import type { FieldGeoJson } from '../../types/maps/map.types.ts';
import { request } from '../core/http.ts';

export const mapsApi = {
  getGeoJson: (signal?: AbortSignal): Promise<FieldGeoJson> => request('/maps/geojson', { signal }),
};
