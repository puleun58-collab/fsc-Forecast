import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardDataSources, formatSourceObservation } from './data-sources';

test('dashboard data sources include only public sources and keep dynamic observation times', () => {
  const dataSources = buildDashboardDataSources({
    latestOpinetObservedAt: '2026-07-14T01:25:00.000Z',
    latestDubaiObservedAt: '2026-06-01T00:00:00.000Z',
    latestUsdKrwObservedAt: '2026-07-10T00:00:00.000Z',
    opinetFreshnessStatus: 'fresh',
  });

  assert.deepEqual(
    dataSources.map((source) => source.sourceCode),
    ['opinet-diesel', 'fred-dubai', 'fred-usd-krw'],
  );
  assert.equal(dataSources[0].latestObservedAt, '2026-07-14T01:25:00.000Z');
  assert.equal(dataSources[1].latestObservedAt, '2026-06-01T00:00:00.000Z');
  assert.equal(dataSources[2].latestObservedAt, '2026-07-10T00:00:00.000Z');
});

test('source observation formatter respects datetime, date, month, and missing values', () => {
  assert.equal(formatSourceObservation('2026-07-14T01:25:00.000Z', 'datetime'), '2026.07.14 10:25 KST');
  assert.equal(formatSourceObservation('2026-07-10T00:00:00.000Z', 'date'), '2026.07.10');
  assert.equal(formatSourceObservation('2026-06-01T00:00:00.000Z', 'month'), '2026.06 기준');
  assert.equal(formatSourceObservation(null, 'date'), '확인 불가');
});
