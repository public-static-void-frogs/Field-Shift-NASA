import assert from 'node:assert/strict';
import test from 'node:test';
import {
  weatherColor,
  summarizeWeather,
  weatherHighlights,
} from '../src/features/weather/utils/weatherVisuals.ts';

const units = { temperature: '°C', rainfall: 'mm', wind: 'km/h', humidity: '%', moisture: '%' };
const record = (date, values) => ({
  date,
  temperature: null,
  low: null,
  rainfall: null,
  moisture: null,
  humidity: null,
  wind: null,
  ...values,
});

test('temperature palette is cold blue and warm red, with the same colors in Fahrenheit', () => {
  const rgb = (color) => color.match(/\d+/g).map(Number);
  const cold = rgb(weatherColor(0, 'temperature', units));
  const hot = rgb(weatherColor(35, 'temperature', units));
  assert.ok(cold[2] > cold[0] && cold[2] > cold[1]);
  assert.ok(hot[0] > hot[1] && hot[0] > hot[2]);
  assert.equal(
    weatherColor(0, 'temperature', units),
    weatherColor(32, 'temperature', { ...units, temperature: '°F' }),
  );
  assert.equal(
    weatherColor(35, 'temperature', units),
    weatherColor(95, 'temperature', { ...units, temperature: '°F' }),
  );
  assert.equal(weatherColor(null, 'temperature', units), '#e5e9e1');
});

test('weather summaries preserve missing values and do not invent zero readings', () => {
  const records = [
    record('2026-10-30', { temperature: 10, rainfall: 2 }),
    record('2026-10-31', { temperature: null, rainfall: null }),
    record('2026-11-01', { temperature: 20, rainfall: 4 }),
  ];
  const summary = summarizeWeather(records, 'temperature');
  assert.equal(summary.low.date, '2026-10-30');
  assert.equal(summary.high.date, '2026-11-01');
  assert.equal(summary.average, 15);
  assert.equal(summary.count, 2);
  assert.equal(summarizeWeather(records, 'moisture'), null);
  assert.equal(summarizeWeather(records, 'rainfall').total, 6);
});

test('farm outlook uses only the next seven days and actual low temperatures', () => {
  const records = Array.from({ length: 8 }, (_, index) =>
    record(`2026-11-${String(index + 1).padStart(2, '0')}`, {
      temperature: 20,
      low: index - 2,
      rainfall: 1,
    }),
  );
  records[7].low = -50;
  assert.equal(weatherHighlights(records).rainTotal, 7);
  assert.equal(weatherHighlights(records).coolestNight.date, '2026-11-01');
  assert.equal(weatherHighlights([record('2026-11-01', { rainfall: 2 })]).rainTotal, null);
  assert.equal(weatherHighlights([]).rainTotal, null);
  assert.equal(weatherHighlights([]).coolestNight, undefined);
});
