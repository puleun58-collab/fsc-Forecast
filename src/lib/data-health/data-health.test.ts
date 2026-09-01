import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDataHealthItem,
  getDataHealthStatus,
  getExpectedLatestDate,
  summarizeDataHealth,
  type DataHealthItem,
} from './data-health';

const NOW = new Date('2026-09-01T02:00:00.000Z');

function healthItem(overrides: Partial<DataHealthItem> = {}): DataHealthItem {
  return {
    sourceCode: 'opinet-daily',
    source: '오피넷 일별 경유가',
    status: 'healthy',
    latestDataAt: '2026-08-31T00:00:00.000Z',
    latestDataLabel: null,
    lastCollectedAt: '2026-09-01T01:05:00.000Z',
    expectedLatestDate: '2026-08-31',
    delayLabel: null,
    errorAt: null,
    errorMessage: null,
    ...overrides,
  };
}

test('all current sources produce the healthy aggregate state', () => {
  const summary = summarizeDataHealth([
    healthItem(),
    healthItem({ sourceCode: 'opinet-weekly', source: '오피넷 주간 경유가' }),
    healthItem({ sourceCode: 'dubai', source: 'Dubai' }),
    healthItem({ sourceCode: 'usd-krw', source: 'USD/KRW' }),
  ]);

  assert.equal(summary.status, 'healthy');
  assert.equal(summary.label, '전체 정상');
});

test('one delayed source is counted without escalating to an error', () => {
  const delayed = buildDataHealthItem({
    sourceCode: 'usd-krw',
    source: 'USD/KRW',
    latestDataAt: '2026-08-28',
    lastCollectedAt: '2026-09-01T01:00:00.000Z',
    collectionState: 'succeeded',
    now: NOW,
  });
  const summary = summarizeDataHealth([healthItem(), delayed]);

  assert.equal(delayed.status, 'delayed');
  assert.equal(delayed.delayLabel, '1영업일 지연');
  assert.equal(summary.status, 'delayed');
  assert.equal(summary.label, '1개 지연');
});

test('a failed collection takes precedence and exposes only a supplied safe message', () => {
  const failed = buildDataHealthItem({
    sourceCode: 'dubai',
    source: 'Dubai',
    latestDataAt: '2026-08-28',
    lastCollectedAt: '2026-08-31T01:00:00.000Z',
    collectionState: 'failed',
    errorAt: '2026-09-01T01:05:00.000Z',
    errorMessage: 'Dubai 데이터 수집 요청 실패',
    now: NOW,
  });
  const summary = summarizeDataHealth([healthItem(), failed]);

  assert.equal(failed.status, 'error');
  assert.equal(failed.errorMessage, 'Dubai 데이터 수집 요청 실패');
  assert.equal(summary.status, 'error');
  assert.equal(summary.label, '확인 필요');
});

test('a source without an observation is marked missing', () => {
  const missing = buildDataHealthItem({
    sourceCode: 'opinet-daily',
    source: '오피넷 일별 경유가',
    latestDataAt: null,
    lastCollectedAt: null,
    collectionState: null,
    now: NOW,
  });
  const summary = summarizeDataHealth([missing]);

  assert.equal(missing.status, 'missing');
  assert.equal(missing.latestDataAt, null);
  assert.equal(summary.label, '1개 데이터 없음');
});

test('weekends do not make Friday USD/KRW data look delayed on Monday', () => {
  const mondayMorningKst = new Date('2026-09-07T02:00:00.000Z');

  assert.equal(getExpectedLatestDate('usd-krw', mondayMorningKst), '2026-09-04');
  assert.equal(
    getDataHealthStatus({
      sourceCode: 'usd-krw',
      latestDataAt: '2026-09-04',
      collectionState: 'succeeded',
      now: mondayMorningKst,
    }),
    'healthy',
  );
});

test('configured market closures are excluded from the expected observation date', () => {
  const tuesdayMorningKst = new Date('2026-09-08T02:00:00.000Z');
  const laborDayClosure = new Set(['2026-09-07']);

  assert.equal(getExpectedLatestDate('usd-krw', tuesdayMorningKst, laborDayClosure), '2026-09-04');
  assert.equal(
    getDataHealthStatus({
      sourceCode: 'usd-krw',
      latestDataAt: '2026-09-04',
      collectionState: 'succeeded',
      now: tuesdayMorningKst,
      closedDates: laborDayClosure,
    }),
    'healthy',
  );
});

test('weekly freshness waits for the Friday publication window', () => {
  assert.equal(
    getExpectedLatestDate('opinet-weekly', new Date('2026-09-04T01:59:00.000Z')),
    '2026-08-27',
  );
  assert.equal(
    getExpectedLatestDate('opinet-weekly', new Date('2026-09-04T03:00:00.000Z')),
    '2026-09-03',
  );
});

test('a successful sync with no latest observation timestamp is still missing', () => {
  assert.equal(
    getDataHealthStatus({
      sourceCode: 'dubai',
      latestDataAt: null,
      collectionState: 'succeeded',
      now: NOW,
    }),
    'missing',
  );
});
