import type { Map as LeafletMap } from 'leaflet';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { FieldGeoJson, MapLayer } from '../../../types/maps/map.types.ts';
import { mapLegends } from '../utils/mapStyles.ts';
import { fitParcels } from '../utils/mapViewport.ts';

export function useFieldMap(geojson: FieldGeoJson, boundaryOnly: boolean) {
  const { t } = useTranslation();
  const map = useRef<LeafletMap | null>(null);
  const [selectedLayer, setLayer] = useState<MapLayer>('Crop health');
  const layer = boundaryOnly ? 'Field boundaries' : selectedLayer;
  const { preferences } = useFarm();
  const legend = mapLegends[layer].map((item) => ({ ...item, label: t(item.label) }));
  function recenter() {
    if (map.current) {
      fitParcels(map.current, geojson);
    }
  }

  return { map, setLayer, layer, preferences, legend, recenter };
}
