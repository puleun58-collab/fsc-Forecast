import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpinetWeekStartDate, getOpinetDisplayWeek, getOpinetWeekEnd } from './weekly-period';

const DISPLAY_WEEK_CASES = [
  ['2026-07-05', '2026-07-09', { year: 2026, month: 7, weekOfMonth: 2 }],
  ['2026-07-12', '2026-07-16', { year: 2026, month: 7, weekOfMonth: 3 }],
  ['2026-07-19', '2026-07-23', { year: 2026, month: 7, weekOfMonth: 4 }],
  ['2026-07-26', '2026-07-30', { year: 2026, month: 7, weekOfMonth: 5 }],
  ['2026-08-02', '2026-08-06', { year: 2026, month: 8, weekOfMonth: 1 }],
  ['2026-08-09', '2026-08-13', { year: 2026, month: 8, weekOfMonth: 2 }],
  ['2026-08-16', '2026-08-20', { year: 2026, month: 8, weekOfMonth: 3 }],
  ['2026-08-23', '2026-08-27', { year: 2026, month: 8, weekOfMonth: 4 }],
  ['2026-08-30', '2026-09-03', { year: 2026, month: 9, weekOfMonth: 1 }],
] as const;

test('getOpinetDisplayWeek assigns Sunday–Thursday periods by their Wednesday', () => {
  for (const [startDate, endDate, expected] of DISPLAY_WEEK_CASES) {
    assert.deepEqual(getOpinetDisplayWeek(startDate, endDate), expected);
  }
});

test('createOpinetWeekStartDate is the inverse of the Wednesday-based display week', () => {
  for (const [expectedStartDate, expectedEndDate, displayWeek] of DISPLAY_WEEK_CASES) {
    const weekStartDate = createOpinetWeekStartDate(
      displayWeek.year,
      displayWeek.month,
      displayWeek.weekOfMonth,
    );

    assert.equal(weekStartDate.toISOString().slice(0, 10), expectedStartDate);
    assert.equal(getOpinetWeekEnd(weekStartDate).toISOString().slice(0, 10), expectedEndDate);
  }
});

test('August 2026 official weekly labels map to the matching FSC periods', () => {
  const firstWeekStart = createOpinetWeekStartDate(2026, 8, 1);
  const secondWeekStart = createOpinetWeekStartDate(2026, 8, 2);

  assert.equal(firstWeekStart.toISOString().slice(0, 10), '2026-08-02');
  assert.equal(getOpinetWeekEnd(firstWeekStart).toISOString().slice(0, 10), '2026-08-06');
  assert.equal(secondWeekStart.toISOString().slice(0, 10), '2026-08-09');
  assert.equal(getOpinetWeekEnd(secondWeekStart).toISOString().slice(0, 10), '2026-08-13');
});

test('getOpinetDisplayWeek handles a December-to-January year boundary', () => {
  assert.deepEqual(getOpinetDisplayWeek('2024-12-29', '2025-01-02'), {
    year: 2025,
    month: 1,
    weekOfMonth: 1,
  });
});

test('getOpinetDisplayWeek accepts serialized UTC dates used by the dashboard DTO', () => {
  assert.deepEqual(
    getOpinetDisplayWeek('2026-08-30T00:00:00.000Z', '2026-09-03T00:00:00.000Z'),
    { year: 2026, month: 9, weekOfMonth: 1 },
  );
});

test('getOpinetDisplayWeek rejects dates from different Opinet weeks', () => {
  assert.throws(
    () => getOpinetDisplayWeek('2026-08-30', '2026-09-10'),
    /same Sunday–Thursday week/,
  );
});
