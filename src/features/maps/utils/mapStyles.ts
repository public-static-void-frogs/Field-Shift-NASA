import type { TFunction } from 'i18next';
import type { PathOptions } from 'leaflet';
import type { Field } from '../../../types/fields/field.types.ts';
import type { MapLayer } from '../../../types/maps/map.types.ts';

export const mapLegends = {
  'Soil moisture': [
    { color: '#61b4d4', label: '60% or more' },
    { color: '#9bcdd9', label: '40–59%' },
    { color: '#dbe5b2', label: 'Below 40%' },
  ],
  'Field boundaries': [
    { color: '#f1ebcf', label: 'Field boundaries' },
    { color: '#f1ebcf', label: 'Dashed: available' },
  ],
  'Crop health': [
    { color: '#82a66a', label: 'Healthy' },
    { color: '#c8b969', label: 'Needs attention' },
    { color: '#d59a62', label: 'Critical' },
  ],
};
function getParcelColor(field: Field | undefined, layer: MapLayer) {
  if (!field || layer === 'Field boundaries') {
    return '#f1ebcf';
  }
  if (layer === 'Soil moisture') {
    if (field.moisture >= 60) {
      return '#61b4d4';
    }
    if (field.moisture >= 40) {
      return '#9bcdd9';
    }
    return '#dbe5b2';
  }
  if (field.status === 'Critical') {
    return '#e7aa66';
  }
  if (field.status === 'Needs attention') {
    return '#e4d17c';
  }
  return '#c0dd8d';
}
export function parcelStyle(field: Field | undefined, layer: MapLayer): PathOptions {
  const color = getParcelColor(field, layer);
  let fillOpacity = field ? 0.2 : 0.06;
  if (layer === 'Field boundaries') {
    fillOpacity = 0.02;
  }
  return {
    color,
    fillColor: color,
    weight: field ? 2.5 : 1.5,
    fillOpacity,
    dashArray: field ? undefined : '6 5',
  };
}
export function getParcelLabel(
  field: Field | undefined,
  id: number | undefined,
  name: string | undefined,
  t: TFunction,
) {
  if (field) {
    return t('View {{name}}', { name: field.name });
  }
  if (id) {
    return t('Add this field');
  }
  return name || t('Parcel');
}
