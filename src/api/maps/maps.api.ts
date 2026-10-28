import type { FieldGeoJson } from '../../types/maps/map.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { fieldGeoJson } from './mocks/geojson.mock.ts';
export const mapsApi = {
  getGeoJson: (signal?: AbortSignal): Promise<FieldGeoJson> =>
    mockResponse(() => fieldGeoJson, signal),
};
