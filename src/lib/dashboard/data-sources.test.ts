import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardDataSources, formatSourceCollectionDate, formatSourceObservation } from './data-sources';

test('dashboard data sources include only public sources and keep dynamic observation times', () => {
  const dataSources = buildDashboardDataSources({
    latestOpinetObservationDate: '2026-07-14',
    latestOpinetCollectedAt: '2026-07-14T01:25:00.000Z',
    latestDubaiObservationDate: '2026-06-01T00:00:00.000Z',
    latestDubaiCollectedAt: '2026-07-10T00:00:00.000Z',
    latestUsdKrwObservationDate: '2026-07-10T00:00:00.000Z',
    latestUsdKrwCollectedAt: '2026-07-15T00:00:00.000Z',
    opinetFreshnessStatus: 'fresh',
  });

  assert.deepEqual(
    dataSources.map((source) => source.sourceCode),
    ['opinet-diesel', 'fred-dubai', 'fred-usd-krw'],
  );
  assert.equal(dataSources[0].latestObservationDate, '2026-07-14');
  assert.equal(dataSources[0].collectedAt, '2026-07-14T01:25:00.000Z');
  assert.equal(dataSources[1].latestObservationDate, '2026-06-01T00:00:00.000Z');
  assert.equal(dataSources[1].collectedAt, '2026-07-10T00:00:00.000Z');
  assert.equal(dataSources[2].latestObservationDate, '2026-07-10T00:00:00.000Z');
  assert.equal(dataSources[2].collectedAt, '2026-07-15T00:00:00.000Z');
});

test('source observation and collection formatters respect granularity and missing values', () => {
  assert.equal(formatSourceObservation('2026-07-14', 'date'), '2026.07.14');
  assert.equal(formatSourceObservation('2026-07-10T00:00:00.000Z', 'date'), '2026.07.10');
  assert.equal(formatSourceObservation('2026-06-01T00:00:00.000Z', 'month'), '2026.06 기준');
  assert.equal(formatSourceObservation(null, 'date'), '확인 불가');
  assert.equal(formatSourceCollectionDate('2026-07-14T01:25:00.000Z'), '2026.07.14 10:25 KST');
  assert.equal(formatSourceCollectionDate(null), '확인 불가');
});
