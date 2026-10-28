import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldGeoJson } from '../src/data/fieldGeoJson.ts';
import { getFeatureFieldId, getGeoJsonBounds } from '../src/utils/mapGeometry.ts';

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
    assert.equal(getFeatureFieldId(parcel), index + 1);
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

test('field matching prefers fieldId, accepts feature IDs, and rejects invalid IDs', () => {
  assert.equal(getFeatureFieldId(feature(null, { fieldId: 3 }, 9)), 3);
  assert.equal(getFeatureFieldId(feature(null, null, '6')), 6);
  for (const id of [undefined, '', 0, -2, 1.5, 'not-a-field']) {
    assert.equal(getFeatureFieldId(feature(null, null, id)), undefined);
  }
});
