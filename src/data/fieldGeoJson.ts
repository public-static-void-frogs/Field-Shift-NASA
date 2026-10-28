import type { Feature, Polygon } from 'geojson';
import type { FieldGeoJson, FieldMapProperties } from '../types/map';

function rectangle(
  id: number,
  west: number,
  south: number,
  east: number,
  north: number,
): Feature<Polygon, FieldMapProperties> {
  return {
    type: 'Feature',
    id,
    properties: { fieldId: id },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

// Sample boundaries over actual farmland west of Ames, Iowa.
// These rectangles illustrate GeoJSON support; they are not cadastral boundaries.
export const fieldGeoJson: FieldGeoJson = {
  type: 'FeatureCollection',
  features: [
    rectangle(1, -93.748, 42.043, -93.742, 42.047),
    rectangle(2, -93.74, 42.043, -93.734, 42.047),
    rectangle(3, -93.748, 42.037, -93.742, 42.041),
    rectangle(4, -93.732, 42.043, -93.726, 42.047),
    rectangle(5, -93.74, 42.037, -93.734, 42.041),
    rectangle(6, -93.732, 42.037, -93.726, 42.041),
  ],
};

export const satelliteTiles = {
  url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
};
