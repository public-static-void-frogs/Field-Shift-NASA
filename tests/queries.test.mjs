import './support/backend.mjs';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { hashKey, QueryObserver } from '@tanstack/react-query';
import { createQueryClient } from '../src/api/core/query-client.ts';
import { fieldsApi } from '../src/api/fields/fields.api.ts';
import { fieldQueries, fieldQueryKeys } from '../src/api/fields/fields.queries.ts';
import { fieldMutations } from '../src/api/fields/fields.mutations.ts';
import { planningQueries, planningQueryKeys } from '../src/api/planning/planning.queries.ts';
import { planningMutations } from '../src/api/planning/planning.mutations.ts';
import { overviewQueries, overviewQueryKeys } from '../src/api/overview/overview.queries.ts';
import { weatherQueries, weatherQueryKeys } from '../src/api/weather/weather.queries.ts';
import {
  notificationQueries,
  notificationQueryKeys,
} from '../src/api/notifications/notifications.queries.ts';
import { settingsApi } from '../src/api/settings/settings.api.ts';
import { settingsMutations } from '../src/api/settings/settings.mutations.ts';
import { farmQueries } from '../src/api/farm/farm.queries.ts';
import { mapQueries, mapQueryKeys } from '../src/api/maps/maps.queries.ts';
import { getCalendarEvents } from '../src/features/planning/utils/eventResponses.ts';
const weatherLocation = await settingsApi.get();
const initialFields = await fieldsApi.getAll();
const firstId = initialFields[0].id;
const secondId = initialFields[1].id;
const missingId = '00000000-0000-4000-8000-000000000000';

function client() {
  const value = createQueryClient();
  value.setDefaultOptions({
    queries: { retry: false, staleTime: 60_000 },
    mutations: { retry: false },
  });
  return value;
}

test('keys are deterministic, parameterized and separated by feature/resource', () => {
  assert.equal(
    hashKey(overviewQueryKeys.charts({ days: 30, metric: 'health' })),
    hashKey(overviewQueryKeys.charts({ metric: 'health', days: 30 })),
  );
  const keys = [
    fieldQueryKeys.list(),
    fieldQueryKeys.byId(firstId),
    fieldQueryKeys.byId(secondId),
    fieldQueryKeys.properties(firstId),
    fieldQueryKeys.history(firstId),
    fieldQueryKeys.recommendation(firstId),
    planningQueryKeys.fieldEvents(firstId),
    planningQueryKeys.strategy(firstId),
    planningQueryKeys.responses(),
    weatherQueryKeys.history(weatherLocation, { range: '7 days' }),
    weatherQueryKeys.history(weatherLocation, { range: '30 days' }),
    weatherQueryKeys.forecast(weatherLocation, firstId),
    weatherQueryKeys.forecast(weatherLocation, secondId),
    weatherQueryKeys.history(weatherLocation, { range: '7 days' }, firstId),
    weatherQueryKeys.history(weatherLocation, { range: '7 days' }, secondId),
    overviewQueryKeys.charts({ days: 30, metric: 'health' }),
    overviewQueryKeys.charts({ days: 90, metric: 'health' }),
    overviewQueryKeys.charts({ days: 30, metric: 'moisture' }),
  ];
  assert.equal(new Set(keys.map(hashKey)).size, keys.length);
});

test('concurrent consumers share a request and fresh cached data is reused', async () => {
  const cache = client();
  let requests = 0;
  const options = {
    ...fieldQueries.list(),
    queryFn: () => {
      requests++;
      return fieldsApi.getAll();
    },
  };
  const [first, second] = await Promise.all([cache.fetchQuery(options), cache.fetchQuery(options)]);
  assert.deepEqual(first, second);
  await cache.fetchQuery(options);
  assert.equal(requests, 1);
  cache.clear();
});

test('HTTP responses are detached; canceled reads reject', async () => {
  const fields = await fieldsApi.getAll();
  fields[0].name = 'Changed outside the service';
  assert.equal((await fieldsApi.getById(firstId)).name, 'North Meadow');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fieldsApi.getAll(controller.signal), (error) => error.name === 'AbortError');
  assert.equal(await fieldsApi.getById(missingId), null);
});

test('field mutations invalidate dependent caches and preserve GUID-linked resources', async () => {
  const cache = client();
  const params = { days: 30, metric: 'health' };
  await Promise.all([
    cache.fetchQuery(fieldQueries.list()),
    cache.fetchQuery(mapQueries.geojson()),
    cache.fetchQuery(fieldQueries.byId(firstId)),
    cache.fetchQuery(planningQueries.events()),
    cache.fetchQuery(planningQueries.strategy(firstId)),
    cache.fetchQuery(overviewQueries.charts(params)),
    cache.fetchQuery(notificationQueries.list()),
  ]);
  let createdId;
  try {
    const field = await cache
      .getMutationCache()
      .build(cache, fieldMutations.create(cache))
      .execute({ parcelId: 6, name: '  Test field  ', crop: 'Soybeans' });
    createdId = field.id;
    assert.equal(field.name, 'Test field');

    assert.equal(typeof createdId, 'string');
    assert.notEqual(createdId, field.parcelId);
    for (const key of [
      fieldQueryKeys.list(),
      mapQueryKeys.geojson(),
      fieldQueryKeys.byId(firstId),
      planningQueryKeys.events(),
      planningQueryKeys.strategy(firstId),
      overviewQueryKeys.charts(params),
      notificationQueryKeys.list(),
    ]) {
      assert.equal(cache.getQueryState(key).isInvalidated, true, JSON.stringify(key));
    }
    assert.equal((await cache.fetchQuery(fieldQueries.list())).length, initialFields.length + 1);
    assert.equal((await cache.fetchQuery(fieldQueries.byId(createdId))).name, 'Test field');
    const addedMap = await cache.fetchQuery(mapQueries.geojson());
    assert.equal(
      addedMap.features.find((feature) => feature.properties.parcelId === 6).properties.fieldId,
      createdId,
    );
    assert.equal(
      (await cache.fetchQuery(planningQueries.strategy(createdId))).plan.fieldId,
      createdId,
    );
    assert.ok(
      (await cache.fetchQuery(overviewQueries.charts(params))).trends.at(-1)[
        `field-${createdId}`
      ] !== undefined,
    );
    const events = await cache.fetchQuery(planningQueries.events());
    const createdEvents = events.filter((event) => event.fieldId === createdId);
    assert.ok(createdEvents.length > 0);
    const responses = await cache
      .getMutationCache()
      .build(cache, planningMutations.respondToStrategy(cache))
      .execute({ fieldId: createdId, status: 'declined' });
    assert.equal(
      getCalendarEvents(events, responses).some((event) => event.fieldId === createdId),
      false,
    );
    assert.deepEqual(await cache.fetchQuery(planningQueries.responses()), responses);
    await assert.rejects(fieldsApi.create({ parcelId: 6, name: 'Duplicate', crop: 'Corn' }));
    await cache.getMutationCache().build(cache, fieldMutations.remove(cache)).execute(createdId);
    assert.equal((await cache.fetchQuery(fieldQueries.list())).length, initialFields.length);
    assert.equal(await cache.fetchQuery(fieldQueries.byId(createdId)), null);
    assert.equal(await cache.fetchQuery(planningQueries.strategy(createdId)), null);
    assert.equal(
      (await cache.fetchQuery(planningQueries.events())).some(
        (event) => event.fieldId === createdId,
      ),
      false,
    );
    const removedMap = await cache.fetchQuery(mapQueries.geojson());
    assert.equal(
      removedMap.features.find((feature) => feature.properties.parcelId === 6).properties.fieldId,
      null,
    );
    const remaining = await cache.fetchQuery(planningQueries.responses());
    assert.ok(createdEvents.every((event) => remaining[event.id] === undefined));
  } finally {
    if (createdId && (await fieldsApi.getById(createdId))) {
      await fieldsApi.remove(createdId);
    }
    cache.clear();
  }
});

test('weather ranges have independent caches and failed queries can be retried', async () => {
  const cache = client();
  const [week, month] = await Promise.all([
    cache.fetchQuery(weatherQueries.history(weatherLocation, { range: '7 days' })),
    cache.fetchQuery(weatherQueries.history(weatherLocation, { range: '30 days' })),
  ]);
  assert.equal(week.records.length, 7);
  assert.equal(month.records.length, 30);
  await assert.rejects(
    cache.fetchQuery({
      queryKey: ['test', 'recovery'],
      queryFn: () => Promise.reject(new Error('Unavailable')),
    }),
  );
  assert.equal(
    await cache.fetchQuery({
      queryKey: ['test', 'recovery'],
      queryFn: () => Promise.resolve('recovered'),
    }),
    'recovered',
  );
  cache.clear();
});

async function sourceFiles(directory) {
  const paths = await Promise.all(
    (await readdir(directory, { withFileTypes: true })).map((entry) =>
      entry.isDirectory()
        ? sourceFiles(`${directory}/${entry.name}`)
        : [`${directory}/${entry.name}`],
    ),
  );
  return paths.flat().filter((path) => /\.tsx?$/.test(path));
}

test('UI does not import mock implementations', async () => {
  for (const file of await sourceFiles(new URL('../src', import.meta.url).pathname)) {
    const source = await readFile(file, 'utf8');
    if (!file.includes('/api/')) {
      assert.doesNotMatch(source, /(?:from\s*|import\s*\()['"][^'"]*\/mocks\//, file);
    }
  }
});

test('weather caches isolate coordinates, dates and units; settings changes clear old weather', async () => {
  assert.notEqual(
    hashKey(weatherQueryKeys.current(weatherLocation)),
    hashKey(weatherQueryKeys.current({ ...weatherLocation, longitude: 10 })),
  );
  assert.notEqual(
    hashKey(weatherQueryKeys.forecast(weatherLocation)),
    hashKey(weatherQueryKeys.forecast({ ...weatherLocation, units: 'imperial' })),
  );
  const cache = client();
  await cache.fetchQuery(weatherQueries.current(weatherLocation));
  await cache.fetchQuery(farmQueries.profile());
  const history = await cache.fetchQuery(
    weatherQueries.history(weatherLocation, { startDate: '2025-07-01', endDate: '2025-07-07' }),
  );
  assert.equal(history.records[0].date, '2025-07-07');
  const updated = { ...weatherLocation, longitude: 20, location: 'New location' };
  try {
    await cache.getMutationCache().build(cache, settingsMutations.update(cache)).execute(updated);
    assert.equal(cache.getQueryData(weatherQueryKeys.current(weatherLocation)), undefined);
    const result = await cache.fetchQuery(weatherQueries.current(updated));
    assert.equal(result.longitude, 20);
    assert.equal(result.location, 'New location');
  } finally {
    await settingsApi.update(weatherLocation);
    cache.clear();
  }
});

test('field-scoped weather contracts carry backend limits, scores and alerts in independent caches', async () => {
  const cache = client();
  const [first, second] = await Promise.all([
    cache.fetchQuery(weatherQueries.forecast(weatherLocation, firstId)),
    cache.fetchQuery(weatherQueries.forecast(weatherLocation, secondId)),
  ]);
  assert.equal(first.cropAssessment.context.fieldId, firstId);
  assert.equal(second.cropAssessment.context.fieldId, secondId);
  assert.notEqual(first.cropAssessment.context.crop, second.cropAssessment.context.crop);
  assert.equal(first.cropAssessment.model.kind, 'heuristic_stub');
  assert.equal(first.cropAssessment.model.scoreMeaning, 'suitability_0_bad_100_good');
  assert.ok(
    first.records.some((day) => day.cropAssessment.alerts.some((alert) => alert.reading === 'low')),
  );
  assert.equal(first.records[0].cropAssessment.metrics.temperature.valueRiskLevel, 'good');
  const history = await cache.fetchQuery(
    weatherQueries.history(weatherLocation, { range: '7 days' }, firstId),
  );
  assert.equal(history.cropAssessment.context.fieldId, firstId);
  assert.equal(history.cropAssessment.context.climate.source, 'history_window');
  cache.clear();
});

test('history observer keeps its data while a different date range is fetching', async () => {
  const cache = client();
  const weekOptions = weatherQueries.history(weatherLocation, { range: '7 days' }, firstId);
  const week = { records: [{ date: '2026-10-29' }] };
  cache.setQueryData(weekOptions.queryKey, week);
  const observer = new QueryObserver(cache, weekOptions);
  const unsubscribe = observer.subscribe(() => {});
  try {
    for (const period of [
      { range: '30 days' },
      { startDate: '2026-09-01', endDate: '2026-09-15' },
    ]) {
      const previous = observer.getCurrentResult().data;
      let resolve;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const options = {
        ...weatherQueries.history(weatherLocation, period, firstId),
        queryFn: () => pending,
      };
      observer.setOptions(options);
      assert.strictEqual(observer.getCurrentResult().data, previous);
      assert.equal(observer.getCurrentResult().isPlaceholderData, true);
      assert.equal(observer.getCurrentResult().fetchStatus, 'fetching');
      const replacement = { records: [{ date: '2026-09-15' }], period };
      resolve(replacement);
      await cache.fetchQuery(options);
      assert.deepEqual(observer.getCurrentResult().data, replacement);
      assert.equal(observer.getCurrentResult().isPlaceholderData, false);
    }
  } finally {
    unsubscribe();
    cache.clear();
  }
});

test('history placeholder never carries readings into a different field, location or unit system', () => {
  const cache = client();
  const options = weatherQueries.history(weatherLocation, { range: '7 days' }, firstId);
  cache.setQueryData(options.queryKey, { records: [{ date: '2026-10-29' }] });
  const observer = new QueryObserver(cache, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    for (const [location, fieldId] of [
      [weatherLocation, secondId],
      [{ ...weatherLocation, latitude: weatherLocation.latitude + 1 }, firstId],
      [{ ...weatherLocation, units: 'imperial' }, firstId],
    ]) {
      observer.setOptions(options);
      observer.setOptions({
        ...weatherQueries.history(location, { range: '30 days' }, fieldId),
        queryFn: () => new Promise(() => {}),
      });
      assert.equal(observer.getCurrentResult().data, undefined);
      assert.equal(observer.getCurrentResult().isPlaceholderData, false);
    }
  } finally {
    unsubscribe();
    cache.clear();
  }
});
