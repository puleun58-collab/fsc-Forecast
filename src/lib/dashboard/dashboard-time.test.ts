import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateDataDelayMinutes,
  calculateDataFreshness,
  formatDashboardDate,
  formatDashboardDateTime,
  formatDashboardMonth,
  formatDataDelay,
} from './dashboard-time';

test('dashboard time helpers format KST date and datetime values', () => {
  assert.equal(formatDashboardDateTime('2026-07-15T01:48:00.000Z'), '2026.07.15 10:48 KST');
  assert.equal(formatDashboardDate('2026-07-10T00:00:00.000Z'), '2026.07.10');
  assert.equal(formatDashboardMonth('2026-06-01T00:00:00.000Z'), '2026.06');
});

test('dashboard time helpers calculate delay and freshness from data basis time', () => {
  const now = new Date('2026-07-15T01:48:00.000Z');
  const dataBasisAt = '2026-07-14T01:25:00.000Z';

  assert.equal(calculateDataDelayMinutes(dataBasisAt, now), 1463);
  assert.equal(formatDataDelay(1463), '24시간 23분');
  assert.equal(calculateDataFreshness(dataBasisAt, now), 'fresh');
  assert.equal(calculateDataFreshness('2026-07-13T01:25:00.000Z', now), 'delayed');
  assert.equal(calculateDataFreshness('2026-07-08T01:25:00.000Z', now), 'delayed');
  assert.equal(calculateDataFreshness('2026-07-07T01:25:00.000Z', now), 'stale');
  assert.equal(calculateDataFreshness(null, now), 'unavailable');
});
