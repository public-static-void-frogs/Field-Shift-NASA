import { calculatePlantingDate, planningToday } from '../src/api/planning/mocks/agronomy.mock.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventStatus, isPlanDate } from '../src/utils/planningDates.ts';

test('normal soybean conditions retain the regional planting date', () => {
  assert.deepEqual(calculatePlantingDate('Soybeans', 6.5, 64), {
    date: '2027-04-22',
    windowEnd: '2027-05-02',
    soilPreparationDays: 0,
    moistureReviewDays: 0,
  });
});

test('low pH and dry soil shift the planting window across the month boundary', () => {
  assert.deepEqual(calculatePlantingDate('Soybeans', 5.6, 32), {
    date: '2027-05-02',
    windowEnd: '2027-05-12',
    soilPreparationDays: 7,
    moistureReviewDays: 3,
  });
});

test('winter wheat for the 2027 harvest is scheduled in the preceding autumn', () => {
  assert.equal(calculatePlantingDate('Winter wheat', 6.8, 58).date, '2026-09-25');
});

test('calendar date validation rejects impossible or incomplete dates', () => {
  assert.equal(isPlanDate('2027-05-02'), true);
  assert.equal(isPlanDate('2027-02-30'), false);
  assert.equal(isPlanDate('2027-13-01'), false);
  assert.equal(isPlanDate('2027-5-2'), false);
  assert.equal(isPlanDate(undefined), false);
});

test('action statuses use the shared planning clock and seven-day window', () => {
  assert.equal(getEventStatus('2026-05-23', planningToday), 'Completed');
  assert.equal(getEventStatus('2026-05-25', planningToday), 'Due soon');
  assert.equal(getEventStatus('2026-05-31', planningToday), 'Due soon');
  assert.equal(getEventStatus('2026-06-01', planningToday), 'Planned');
});
