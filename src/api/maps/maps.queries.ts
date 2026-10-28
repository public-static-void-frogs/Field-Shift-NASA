import { queryOptions } from '@tanstack/react-query';
import { mapsApi } from './maps.api.ts';

export const mapQueryKeys = {
  all: () => ['maps'] as const,
  geojson: () => ['maps', 'geojson'] as const,
};
export const mapQueries = {
  geojson: () =>
    queryOptions({
      queryKey: mapQueryKeys.geojson(),
      queryFn: ({ signal }) => mapsApi.getGeoJson(signal),
    }),
};
