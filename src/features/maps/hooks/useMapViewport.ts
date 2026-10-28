import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { FieldGeoJson } from '../../../types/maps/map.types.ts';
import { fitParcels } from '../utils/mapViewport.ts';

export function useMapViewport(data: FieldGeoJson) {
  const map = useMap();
  useEffect(() => {
    fitParcels(map, data);
  }, [map, data]);
  useEffect(() => {
    // Leaflet must remeasure when the sidebar or responsive layout changes width.
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
}
