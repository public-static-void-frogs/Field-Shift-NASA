import './support/backend.mjs';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { hashKey } from '@tanstack/react-query';
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
import { getCalendarEvents } from '../src/features/planning/utils/eventResponses.ts';
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
    fieldQueryKeys.byId(1),
    fieldQueryKeys.byId(2),
    fieldQueryKeys.properties(1),
    fieldQueryKeys.history(1),
    fieldQueryKeys.recommendation(1),
    planningQueryKeys.fieldEvents(1),
    planningQueryKeys.strategy(1),
    planningQueryKeys.responses(),
    weatherQueryKeys.history('7 days'),
    weatherQueryKeys.history('30 days'),
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
  assert.equal((await fieldsApi.getById(1)).name, 'North Meadow');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fieldsApi.getAll(controller.signal), (error) => error.name === 'AbortError');
  assert.equal(await fieldsApi.getById(999), null);
});

test('field mutations invalidate dependent caches, survive refetch and clean up decisions', async () => {
  const cache = client();
  const params = { days: 30, metric: 'health' };
  await Promise.all([
    cache.fetchQuery(fieldQueries.list()),
    cache.fetchQuery(fieldQueries.byId(6)),
    cache.fetchQuery(planningQueries.events()),
    cache.fetchQuery(planningQueries.strategy(6)),
    cache.fetchQuery(overviewQueries.charts(params)),
    cache.fetchQuery(notificationQueries.list()),
  ]);
  const initialCount = cache.getQueryData(fieldQueryKeys.list()).length;
  try {
    const field = await cache
      .getMutationCache()
      .build(cache, fieldMutations.create(cache))
      .execute({ parcelId: 6, name: '  Test field  ', crop: 'Soybeans' });
    assert.equal(field.name, 'Test field');
    for (const key of [
      fieldQueryKeys.list(),
      fieldQueryKeys.byId(6),
      planningQueryKeys.events(),
      planningQueryKeys.strategy(6),
      overviewQueryKeys.charts(params),
      notificationQueryKeys.list(),
    ]) {
      assert.equal(cache.getQueryState(key).isInvalidated, true, JSON.stringify(key));
    }
    const fields = await cache.fetchQuery(fieldQueries.list());
    assert.equal(fields.length, initialCount + 1);
    assert.equal(
      fields.some((item) => item.id === 6),
      true,
    );
    assert.equal((await cache.fetchQuery(fieldQueries.byId(6))).name, 'Test field');
    assert.equal((await cache.fetchQuery(planningQueries.strategy(6))).plan.fieldId, 6);
    assert.equal(
      (await cache.fetchQuery(overviewQueries.charts(params))).trends[0]['field-6'] !== undefined,
      true,
    );
    const events = await cache.fetchQuery(planningQueries.events());
    assert.equal(
      events.some((event) => event.fieldId === 6),
      true,
    );

    const responses = await cache
      .getMutationCache()
      .build(cache, planningMutations.respondToStrategy(cache))
      .execute({ fieldId: 6, status: 'declined' });
    assert.equal(
      getCalendarEvents(events, responses).some((event) => event.fieldId === 6),
      false,
    );
    assert.deepEqual(await cache.fetchQuery(planningQueries.responses()), responses);
    assert.deepEqual(cache.getQueryData(planningQueryKeys.responses()), responses);

    await assert.rejects(fieldsApi.create({ parcelId: 6, name: 'Duplicate', crop: 'Corn' }));
    assert.equal((await fieldsApi.getAll()).length, initialCount + 1);
    await cache.getMutationCache().build(cache, fieldMutations.remove(cache)).execute(6);
    assert.equal((await cache.fetchQuery(fieldQueries.list())).length, initialCount);
    assert.equal(await cache.fetchQuery(fieldQueries.byId(6)), null);
    assert.equal(await cache.fetchQuery(planningQueries.strategy(6)), null);
    assert.equal(
      (await cache.fetchQuery(planningQueries.events())).some((event) => event.fieldId === 6),
      false,
    );
    const remainingResponses = await cache.fetchQuery(planningQueries.responses());
    assert.equal(
      Object.keys(remainingResponses).some((key) => key.startsWith('field-6-')),
      false,
    );
  } finally {
    if (await fieldsApi.getById(6)) {
      await fieldsApi.remove(6);
    }
    cache.clear();
  }
});

test('weather ranges have independent caches and failed queries can be retried', async () => {
  const cache = client();
  const [week, month] = await Promise.all([
    cache.fetchQuery(weatherQueries.history('7 days')),
    cache.fetchQuery(weatherQueries.history('30 days')),
  ]);
  assert.equal(week.length, 7);
  assert.equal(month.length, 30);
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
