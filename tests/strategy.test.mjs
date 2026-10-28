import assert from 'node:assert/strict';
import test from 'node:test';
import { initialFields } from '../src/api/fields/mocks/fields.mock.ts';
import { getFieldStrategy } from '../src/api/planning/mocks/strategy.mock.ts';
import { getFieldPlanEvents } from '../src/api/planning/mocks/planning.mock.ts';
import { calendarEventPath } from '../src/utils/planningRoutes.ts';
import {
  eventFingerprint,
  getCalendarEvents,
  getEventDecision,
  parseEventResponses,
  updateEventResponse,
  updateStrategyResponse,
} from '../src/utils/eventResponses.ts';

const events = getFieldPlanEvents(initialFields[1]);
const event = events[0];

test('accepting and rejecting a whole strategy updates every event without changing other fields', () => {
  const otherEvents = getFieldPlanEvents(initialFields[0]);
  const baseline = updateStrategyResponse({}, otherEvents, 'accepted');
  const rejected = updateStrategyResponse(baseline, events, 'declined');
  assert.ok(events.every((item) => getEventDecision(item, rejected) === 'declined'));
  assert.deepEqual(getCalendarEvents([...events, ...otherEvents], rejected), otherEvents);
  const accepted = parseEventResponses(
    JSON.stringify(updateStrategyResponse(rejected, events, 'accepted')),
  );
  assert.ok(
    [...events, ...otherEvents].every((item) => getEventDecision(item, accepted) === 'accepted'),
  );
  assert.deepEqual(getCalendarEvents(events, accepted), events);
  assert.deepEqual(baseline, updateStrategyResponse(baseline, [], 'declined'));
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
    const seedbed = planEvents.find((item) => item.id.endsWith('-seedbed'));
    const planting = planEvents.find((item) => item.id.endsWith('rotation-2027'));
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

test('acceptance is idempotent and survives persisted JSON round trips', () => {
  let responses = updateEventResponse({}, event, 'accepted');
  responses = updateEventResponse(responses, event, 'accepted');
  assert.equal(Object.keys(responses).length, 1);
  assert.equal(getEventDecision(event, parseEventResponses(JSON.stringify(responses))), 'accepted');
  assert.deepEqual(getCalendarEvents(events, responses), events);
});

test('declining hides only that invitation, and accepting it again restores it', () => {
  const declined = updateEventResponse({}, event, 'declined');
  assert.equal(getEventDecision(event, declined), 'declined');
  assert.equal(getCalendarEvents(events, declined).length, events.length - 1);
  assert.ok(!getCalendarEvents(events, declined).some((item) => item.id === event.id));
  assert.ok(events.some((item) => item.id === event.id));
  const accepted = updateEventResponse(declined, event, 'accepted');
  assert.deepEqual(getCalendarEvents(events, accepted), events);
});

test('changed event dates or details invalidate old responses', () => {
  const accepted = updateEventResponse({}, event, 'accepted');
  for (const changed of [
    { ...event, date: '2027-06-10' },
    { ...event, title: 'Updated work order' },
    { ...event, description: 'A changed action plan' },
  ]) {
    assert.equal(getEventDecision(changed, accepted), 'proposed');
  }
});

test('responses remain isolated between fields and can be reset', () => {
  const otherEvent = getFieldPlanEvents(initialFields[0])[0];
  let responses = updateEventResponse({}, event, 'declined');
  responses = updateEventResponse(responses, otherEvent, 'accepted');
  responses = updateEventResponse(responses, event, 'proposed');
  assert.equal(getEventDecision(event, responses), 'proposed');
  assert.equal(getEventDecision(otherEvent, responses), 'accepted');
});

test('corrupt browser storage and invalid response values are ignored', () => {
  for (const raw of [null, 'bad JSON', 'null', '[]', '42'])
    assert.deepEqual(parseEventResponses(raw), {});
  const parsed = parseEventResponses(
    JSON.stringify({
      valid: { status: 'accepted', fingerprint: eventFingerprint(event) },
      invalid: { status: 'completed', fingerprint: 'x' },
      missingFingerprint: { status: 'declined' },
    }),
  );
  assert.deepEqual(Object.keys(parsed), ['valid']);
});
