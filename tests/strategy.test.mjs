import './support/backend.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldsApi } from '../src/api/fields/fields.api.ts';
import { planningApi } from '../src/api/planning/planning.api.ts';

import { calendarEventPath } from '../src/features/planning/utils/planningRoutes.ts';
import {
  getCalendarEvents,
  getEventDecision,
} from '../src/features/planning/utils/eventResponses.ts';

const initialFields = await fieldsApi.getAll();
const strategies = new Map(
  await Promise.all(
    initialFields.map(async (field) => [field.id, await planningApi.getStrategy(field.id)]),
  ),
);
const getFieldStrategy = (field) => strategies.get(field.id);
const getFieldPlanEvents = (field) => getFieldStrategy(field).events;
const events = getFieldPlanEvents(initialFields[1]);
const event = events[0];

test('accepting and rejecting a whole strategy updates every event without changing other fields', async () => {
  const otherEvents = getFieldPlanEvents(initialFields[0]);
  await planningApi.respondToStrategy({ fieldId: initialFields[0].id, status: 'accepted' });
  const rejected = await planningApi.respondToStrategy({
    fieldId: initialFields[1].id,
    status: 'declined',
  });
  assert.ok(events.every((item) => getEventDecision(item, rejected) === 'declined'));
  assert.deepEqual(getCalendarEvents([...events, ...otherEvents], rejected), otherEvents);
  const accepted = await planningApi.respondToStrategy({
    fieldId: initialFields[1].id,
    status: 'accepted',
  });
  assert.ok(
    [...events, ...otherEvents].every((item) => getEventDecision(item, accepted) === 'accepted'),
  );
  assert.deepEqual(getCalendarEvents(events, accepted), events);
});

test('field strategies have matching instructions, calendar proposals, and chronologically ordered forecasts', () => {
  for (const field of initialFields) {
    const strategy = getFieldStrategy(field);
    assert.equal(strategy.plan.fieldId, field.id);
    assert.deepEqual(
      strategy.steps.map((step) => step.event.id),
      strategy.events.map((item) => item.id),
    );
    assert.ok(strategy.steps.every((step) => step.checkpoint.length > 20));
    assert.ok(strategy.events.every((item) => item.fieldId === field.id));
    assert.deepEqual(
      strategy.forecast.map((point) => point.date),
      strategy.forecast.map((point) => point.date).sort(),
    );
    assert.equal(strategy.forecast[0].health, field.health);
    assert.equal(strategy.forecast[0].moisture, field.moisture);
    assert.ok(strategy.comparison[0].projected >= field.health);
    assert.equal(strategy.forecast.at(-1).health, strategy.comparison[0].projected);
    assert.equal(strategy.forecast.at(-1).moisture, strategy.comparison[1].projected);
    strategy.forecast.forEach((point) => {
      assert.equal(point.currentHealth, field.health);
      assert.equal(point.currentMoisture, field.moisture);
      assert.deepEqual(point.healthImprovement, [field.health, point.health]);
      assert.deepEqual(point.moistureImprovement, [
        Math.min(field.moisture, point.moisture),
        Math.max(field.moisture, point.moisture),
      ]);
      assert.ok(point.range[0] <= point.health && point.health <= point.range[1]);
      assert.ok(point.health >= 0 && point.health <= 100);
      assert.ok(point.moisture >= 0 && point.moisture <= 100);
    });
  }
});

test('seedbed preparation is after the current harvest and before planting for every field', () => {
  for (const field of initialFields) {
    const planEvents = getFieldPlanEvents(field);
    const harvest = planEvents.find((item) => item.category === 'Harvest');
    const seedbed = planEvents.find(
      (item) =>
        item.category === 'Field preparation' && item.title.startsWith('Prepare the seedbed'),
    );
    const planting = planEvents.find(
      (item) => item.category === 'Crop rotation' && item.title.endsWith('2027 season'),
    );
    assert.ok(harvest.date < seedbed.date, `${field.name}: seedbed before harvest`);
    assert.ok(seedbed.date < planting.date, `${field.name}: seedbed after planting`);
  }
});

test('every strategy proposal links to that field and event in the calendar', () => {
  for (const item of events) {
    const path = calendarEventPath(item);
    assert.ok(path.startsWith(`/calendar/${item.date}?`));
    const params = new URLSearchParams(path.split('?')[1]);
    assert.equal(params.get('field'), String(item.fieldId));
    assert.equal(params.get('event'), item.id);
  }
});

test('unanswered invitations are proposed and visible in the calendar', () => {
  assert.equal(getEventDecision(event, {}), 'proposed');
  assert.deepEqual(getCalendarEvents(events, {}), events);
});

test('acceptance is idempotent and persists through HTTP refetches', async () => {
  const first = await planningApi.respondToStrategy({ fieldId: event.fieldId, status: 'accepted' });
  const second = await planningApi.respondToStrategy({
    fieldId: event.fieldId,
    status: 'accepted',
  });
  assert.deepEqual(first, second);
  const persisted = await planningApi.getResponses();
  assert.equal(getEventDecision(event, persisted), 'accepted');
  assert.deepEqual(getCalendarEvents(events, persisted), events);
});

test('declining a strategy hides its events, and accepting it again restores them', async () => {
  const declined = await planningApi.respondToStrategy({
    fieldId: event.fieldId,
    status: 'declined',
  });
  assert.equal(getEventDecision(event, declined), 'declined');
  assert.equal(getCalendarEvents(events, declined).length, 0);
  const accepted = await planningApi.respondToStrategy({
    fieldId: event.fieldId,
    status: 'accepted',
  });
  assert.deepEqual(getCalendarEvents(events, accepted), events);
});

test('changed event dates or details invalidate old responses', async () => {
  const accepted = await planningApi.respondToStrategy({
    fieldId: event.fieldId,
    status: 'accepted',
  });
  for (const changed of [
    { ...event, date: '2027-06-10' },
    { ...event, title: 'Updated work order' },
    { ...event, description: 'A changed action plan' },
  ]) {
    assert.equal(getEventDecision(changed, accepted), 'proposed');
  }
});

test('responses remain isolated between fields and can be reset', async () => {
  const otherEvent = getFieldPlanEvents(initialFields[0])[0];
  await planningApi.respondToStrategy({ fieldId: event.fieldId, status: 'declined' });
  await planningApi.respondToStrategy({ fieldId: otherEvent.fieldId, status: 'accepted' });
  const responses = await planningApi.respondToStrategy({
    fieldId: event.fieldId,
    status: 'proposed',
  });
  assert.equal(getEventDecision(event, responses), 'proposed');
  assert.equal(getEventDecision(otherEvent, responses), 'accepted');
});
