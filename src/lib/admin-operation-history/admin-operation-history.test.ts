import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_OPERATION_HISTORY_LIMIT,
  buildAdminOperationHistory,
  type AdminForecastRunRecord,
  type AdminFscResultRecord,
  type AdminIngestRunRecord,
} from './admin-operation-history';

function ingestRun(overrides: Partial<AdminIngestRunRecord> = {}): AdminIngestRunRecord {
  return {
    id: 'ingest-1',
    status: 'succeeded',
    triggerKind: 'scheduled',
    startedAt: '2026-09-01T02:00:00.000Z',
    completedAt: '2026-09-01T02:03:00.000Z',
    createdAt: '2026-09-01T02:00:00.000Z',
    errorSummary: null,
    ...overrides,
  };
}

function forecastRun(overrides: Partial<AdminForecastRunRecord> = {}): AdminForecastRunRecord {
  return {
    id: 'forecast-1',
    status: 'succeeded',
    mapePct: '1.470',
    metadata: {
      model: {
        version: 'weekly-anchor-trend-v2',
        params: {
          modelId: 'B',
          trendLookbackWeeks: 8,
          dubai: { lagWeeks: 2, weight: 0.2 },
          usdKrw: null,
          externalAdjustmentCapRatio: 0.02,
        },
      },
    },
    startedAt: '2026-09-01T07:15:00.000Z',
    completedAt: '2026-09-01T07:18:00.000Z',
    createdAt: '2026-09-01T07:15:00.000Z',
    errorSummary: null,
    ...overrides,
  };
}

function fscResult(overrides: Partial<AdminFscResultRecord> = {}): AdminFscResultRecord {
  return {
    id: 'fsc-1',
    targetYear: 2026,
    targetQuarter: 3,
    diffRatio: '0.234247',
    oilWeightRate: '0.3000',
    quarterAverageKrwPerL: '1851.370',
    reliabilityGrade: 'C',
    reliabilitySampleCount: 13,
    reliabilityMinimumSampleCount: 13,
    recent13wWeeklyPriceMape: '1.470000',
    approvalStatus: 'pending',
    approvedAt: null,
    createdAt: '2026-09-01T07:20:00.000Z',
    ...overrides,
  };
}

test('operation events are merged into one newest-first timeline', () => {
  const events = buildAdminOperationHistory({
    ingestRuns: [ingestRun()],
    forecastRuns: [forecastRun()],
    fscResults: [
      fscResult({
        id: 'fsc-0',
        diffRatio: '0.227333',
        createdAt: '2026-08-31T07:20:00.000Z',
        approvalStatus: 'approved',
        approvedAt: '2026-08-31T09:10:00.000Z',
      }),
      fscResult(),
    ],
  });

  assert.deepEqual(
    events.map((event) => [event.type, event.occurredAt]),
    [
      ['fsc-recompute', '2026-09-01T07:20:00.000Z'],
      ['forecast', '2026-09-01T07:18:00.000Z'],
      ['ingest', '2026-09-01T02:03:00.000Z'],
      ['fsc-approval', '2026-08-31T09:10:00.000Z'],
      ['fsc-recompute', '2026-08-31T07:20:00.000Z'],
    ],
  );
  assert.equal(events[0]?.label, 'FSC 재계산');
  assert.equal(events[0]?.summary, '2026년 3분기 · +7.03%');
  assert.equal(events[1]?.summary, 'Model B');
  assert.equal(events[2]?.summary, '오피넷 일별 경유가');
  assert.equal(events[3]?.summary, '2026년 3분기');
});

test('an FSC recompute compares its estimated rate with the previous result of the same quarter', () => {
  const events = buildAdminOperationHistory({
    ingestRuns: [],
    forecastRuns: [],
    fscResults: [
      fscResult({ id: 'fsc-previous', diffRatio: '0.227333', createdAt: '2026-08-31T07:20:00.000Z' }),
      fscResult(),
    ],
  });
  const [latest, previous] = events;

  assert.equal(latest?.summary, '2026년 3분기 · +7.03%');
  assert.deepEqual(
    latest?.details.find((detail) => detail.label === '직전 결과 대비'),
    { label: '직전 결과 대비', value: '+0.21%p' },
  );
  assert.deepEqual(
    previous?.details.find((detail) => detail.label === '직전 결과 대비'),
    { label: '직전 결과 대비', value: '직전 결과 없음' },
  );
  assert.deepEqual(
    latest?.details.find((detail) => detail.label === '분기 예상 평균'),
    { label: '분기 예상 평균', value: '1,851.37원/L' },
  );
  assert.deepEqual(
    latest?.details.find((detail) => detail.label === '신뢰도'),
    { label: '신뢰도', value: 'C · MAPE 1.5%' },
  );
  assert.deepEqual(
    latest?.details.find((detail) => detail.label === '승인 상태'),
    { label: '승인 상태', value: '승인 대기' },
  );
});

test('running and failed executions keep their own status without leaking raw errors', () => {
  const events = buildAdminOperationHistory({
    ingestRuns: [
      ingestRun({
        id: 'ingest-failed',
        status: 'failed',
        completedAt: '2026-09-01T02:05:00.000Z',
        errorSummary: 'Error: connect ECONNREFUSED 10.0.0.5:5432 at Socket.handle (/app/node_modules/pg)',
      }),
    ],
    forecastRuns: [
      forecastRun({ id: 'forecast-running', status: 'running', completedAt: null, mapePct: null }),
      forecastRun({
        id: 'forecast-failed',
        status: 'failed',
        completedAt: '2026-09-01T07:19:00.000Z',
        errorSummary: 'DATABASE_URL=postgres://user:pw@host/db timed out',
      }),
    ],
    fscResults: [],
  });
  const statuses = new Map(events.map((event) => [event.id, event]));

  assert.equal(statuses.get('ingest:ingest-failed')?.status, 'failed');
  assert.equal(statuses.get('ingest:ingest-failed')?.errorMessage, '오피넷 데이터 수집이 실패했습니다.');
  assert.equal(statuses.get('forecast:forecast-running')?.status, 'running');
  assert.equal(statuses.get('forecast:forecast-running')?.errorMessage, null);
  assert.equal(statuses.get('forecast:forecast-failed')?.errorMessage, 'Forecast pipeline 실행이 실패했습니다.');
  assert.doesNotMatch(JSON.stringify(events), /ECONNREFUSED|DATABASE_URL|node_modules/);
});

test('a queued ingest run is pending rather than failed', () => {
  const [event] = buildAdminOperationHistory({
    ingestRuns: [ingestRun({ id: 'ingest-queued', status: 'queued', startedAt: null, completedAt: null })],
    forecastRuns: [],
    fscResults: [],
  });

  assert.equal(event?.status, 'pending');
  assert.equal(event?.occurredAt, '2026-09-01T02:00:00.000Z');
});

test('duplicated source rows never produce duplicated events and the list is capped', () => {
  const duplicated = buildAdminOperationHistory({
    ingestRuns: [ingestRun(), ingestRun()],
    forecastRuns: [forecastRun(), forecastRun()],
    fscResults: [fscResult(), fscResult()],
  });

  assert.deepEqual(
    duplicated.map((event) => event.id),
    ['fsc-recompute:fsc-1', 'forecast:forecast-1', 'ingest:ingest-1'],
  );

  const capped = buildAdminOperationHistory({
    ingestRuns: Array.from({ length: 30 }, (_, index) =>
      ingestRun({
        id: `ingest-${index}`,
        completedAt: new Date(Date.UTC(2026, 7, 1, index)).toISOString(),
      }),
    ),
    forecastRuns: [],
    fscResults: [],
  });

  assert.equal(ADMIN_OPERATION_HISTORY_LIMIT, 20);
  assert.equal(capped.length, 20);
  assert.equal(capped[0]?.id, 'ingest:ingest-29');
  assert.equal(capped[19]?.id, 'ingest:ingest-10');
});

test('an unrated FSC result omits the reliability detail instead of printing placeholders', () => {
  const [event] = buildAdminOperationHistory({
    ingestRuns: [],
    forecastRuns: [],
    fscResults: [
      fscResult({ reliabilityGrade: 'U', reliabilitySampleCount: 4, recent13wWeeklyPriceMape: null }),
    ],
  });

  assert.equal(event?.details.some((detail) => detail.label === '신뢰도'), false);
  assert.doesNotMatch(JSON.stringify(event), /기록 없음/);
});
