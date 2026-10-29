import './support/backend.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mapsApi } from '../src/api/maps/maps.api.ts';
import {
  getFeatureFieldId,
  getFeatureParcelId,
  getGeoJsonBounds,
} from '../src/features/maps/utils/mapGeometry.ts';

const fieldGeoJson = await mapsApi.getGeoJson();

const feature = (geometry, properties = null, id) => ({
  type: 'Feature',
  geometry,
  properties,
  id,
});
const collection = (...features) => ({ type: 'FeatureCollection', features });

test('demo parcels are six closed geographic rectangles linked to field IDs', () => {
  assert.equal(fieldGeoJson.features.length, 6);
  fieldGeoJson.features.forEach((parcel, index) => {
    assert.equal(getFeatureParcelId(parcel), index + 1);
    if (index < 5) {
      assert.match(getFeatureFieldId(parcel), /^[0-9a-f-]{36}$/);
    } else {
      assert.equal(getFeatureFieldId(parcel), undefined);
    }
    assert.equal(parcel.geometry.type, 'Polygon');
    const [ring] = parcel.geometry.coordinates;
    assert.equal(ring.length, 5);
    assert.deepEqual(ring[0], ring.at(-1));
    ring.forEach(([longitude, latitude]) => {
      assert.ok(longitude >= -180 && longitude <= 180);
      assert.ok(latitude >= -90 && latitude <= 90);
    });
  });
});

test('GeoJSON longitude/latitude coordinates become latitude/longitude map bounds', () => {
  assert.deepEqual(getGeoJsonBounds(fieldGeoJson), [
    [42.037, -93.748],
    [42.047, -93.726],
  ]);
});

test('replacement polygon and multipolygon collections include every polygon in their bounds', () => {
  const polygon = feature({
    type: 'Polygon',
    coordinates: [
      [
        [30, 50],
        [31, 50],
        [31, 51],
        [30, 50],
      ],
    ],
  });
  const multi = feature({
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [32, 49],
          [33, 49],
          [33, 50],
          [32, 49],
        ],
      ],
      [
        [
          [34, 48],
          [35, 48],
          [35, 49],
          [34, 48],
        ],
      ],
    ],
  });
  assert.deepEqual(getGeoJsonBounds(collection(polygon, multi)), [
    [48, 30],
    [51, 35],
  ]);
});

test('empty geometry collections do not produce invalid fit bounds', () => {
  assert.equal(getGeoJsonBounds(collection()), null);
  assert.equal(getGeoJsonBounds(collection(feature({ type: 'Polygon', coordinates: [] }))), null);
});

test('maps distinguish GUID field references from numeric parcel identifiers', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const item = feature(null, { fieldId: id, parcelId: 3 }, 9);
  assert.equal(getFeatureFieldId(item), id);
  assert.equal(getFeatureParcelId(item), 3);
  assert.equal(getFeatureParcelId(feature(null, { fieldId: null, parcelId: 6 })), 6);
  assert.equal(getFeatureFieldId(feature(null, { fieldId: null, parcelId: 6 })), undefined);
  for (const value of [undefined, '', 0, -2, 1.5, 'not-a-field', '6']) {
    assert.equal(getFeatureFieldId(feature(null, { fieldId: value })), undefined);
  }
});
