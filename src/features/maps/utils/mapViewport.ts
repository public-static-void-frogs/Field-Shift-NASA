import type { Map as LeafletMap } from 'leaflet';
import type { FieldGeoJson } from '../../../types/maps/map.types.ts';
import { getGeoJsonBounds } from './mapGeometry.ts';

export const defaultCenter: [number, number] = [42.042, -93.737];
const fitOptions = { padding: [50, 100] as [number, number], maxZoom: 16, animate: false };

export function fitParcels(map: LeafletMap, data: FieldGeoJson) {
  const bounds = getGeoJsonBounds(data);
  if (bounds) {
    map.fitBounds(bounds, fitOptions);
  } else {
    map.setView(defaultCenter, 14);
  }
}
