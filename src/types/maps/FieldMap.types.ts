import type { Field } from '../fields/field.types.ts';
import type { FieldGeoJson, MapLayer } from './map.types.ts';

export interface FieldMapProps {
  fields: Field[];
  /** WGS84 GeoJSON polygons; properties.fieldId (or feature.id) links to fields. */
  geojson: FieldGeoJson;
  onSelect: (field: Field) => void;
  adding: boolean;
  onAdd: (id: number) => void;
  expanded?: boolean;
  /** Plain satellite view with field outlines, without metric layers or legend. */
  boundaryOnly?: boolean;
}

export type MapViewportProps = { data: FieldGeoJson };

export type ParcelLayerProps = FieldMapProps & { layer: MapLayer };
