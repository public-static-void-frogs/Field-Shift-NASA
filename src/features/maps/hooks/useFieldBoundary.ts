import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { mapQueries } from '../../../api/maps/maps.queries.ts';
import type { FieldGeoJson } from '../../../types/maps/map.types.ts';
import { getFeatureFieldId } from '../utils/mapGeometry.ts';

export function useFieldBoundary(fieldId: string) {
  const { data: fieldGeoJson } = useSuspenseQuery(mapQueries.geojson());
  const geojson = useMemo<FieldGeoJson>(
    () => ({
      type: 'FeatureCollection',
      features: fieldGeoJson.features.filter((feature) => getFeatureFieldId(feature) === fieldId),
    }),
    [fieldId, fieldGeoJson],
  );

  return geojson;
}
