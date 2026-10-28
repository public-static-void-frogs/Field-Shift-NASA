import type { Map as LeafletMap } from 'leaflet';
import { useRef, useState } from 'react';
import type { FieldGeoJson, MapLayer } from '../../../types/maps/map.types.ts';
import { fitParcels } from '../utils/mapViewport.ts';

export function useFieldMap(geojson: FieldGeoJson, boundaryOnly: boolean) {
  const map = useRef<LeafletMap | null>(null);
  const [selectedLayer, setLayer] = useState<MapLayer>('Crop health');
  const layer = boundaryOnly ? 'Field boundaries' : selectedLayer;
  function recenter() {
    if (map.current) {
      fitParcels(map.current, geojson);
    }
  }

  return { map, setLayer, layer, recenter };
}
