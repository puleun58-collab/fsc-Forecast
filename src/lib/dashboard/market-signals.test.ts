import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublicMarketSignals,
  buildPublicMarketSummaryText,
  calculateDirection,
  calculatePercentChange,
  type MarketSignalHistoryInput,
} from './market-signals';

const collectedAt = new Date('2026-07-20T00:00:00.000Z');

function sourcePayload(indicatorCode: 'dubai' | 'usd-krw') {
  return indicatorCode === 'dubai'
    ? {
        provider: 'opinet-dubai-daily',
        frequency: 'daily',
        unit: 'usd_per_barrel',
        valueBasis: 'dubai_spot_estimate',
        sourceUrl: 'https://www.opinet.co.kr/glopcoilSelect.do',
      }
    : {
        provider: 'fred-public-csv',
        seriesId: 'DEXKOUS',
        frequency: 'daily',
        unit: 'krw_per_usd',
        valueBasis: 'new_york_noon_buying_rate',
        sourceUrl: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS',
      };
}

function history(
  indicatorCode: 'dubai' | 'usd-krw',
  latestValue: number,
  previousValue: number,
  syncStatus: MarketSignalHistoryInput['syncStatus'] = 'succeeded',
): MarketSignalHistoryInput {
  return {
    indicatorCode,
    syncStatus,
    rows: [
      {
        observedAt: new Date('2026-07-17T00:00:00.000Z'),
        collectedAt,
        value: latestValue,
        sourcePayload: sourcePayload(indicatorCode),
      },
      {
        observedAt: new Date('2026-07-16T00:00:00.000Z'),
        collectedAt,
        value: previousValue,
        sourcePayload: sourcePayload(indicatorCode),
      },
    ],
  };
}

test('public market signals use latest two valid authoritative daily rows', () => {
  const dubai = history('dubai', 76.9, 75.79);
  dubai.rows.push(
    {
      observedAt: new Date('2026-08-01T00:00:00.000Z'),
      collectedAt,
      value: 90,
      sourcePayload: {
        provider: 'fred-public-csv',
        seriesId: 'POILDUBUSDM',
        frequency: 'monthly',
        unit: 'usd_per_barrel',
        valueBasis: 'monthly_average',
        sourceUrl: 'https://fred.stlouisfed.org/series/POILDUBUSDM',
      },
    },
    {
      observedAt: new Date('2026-07-18T00:00:00.000Z'),
      collectedAt,
      value: 0,
      sourcePayload: sourcePayload('dubai'),
    },
  );

  const signals = buildPublicMarketSignals([dubai, history('usd-krw', 1490, 1488.5)]);
  const dubaiSignal = signals[0];

  assert.equal(dubaiSignal?.status, 'ready');
  assert.equal(dubaiSignal?.latestObservationDate, '2026-07-17T00:00:00.000Z');
  assert.equal(dubaiSignal?.value, 76.9);
  assert.equal(dubaiSignal?.previousValue, 75.79);
  assert.equal(dubaiSignal?.absoluteChange?.toFixed(2), '1.11');
  assert.equal(dubaiSignal?.percentChange?.toFixed(2), '1.46');
  assert.equal(dubaiSignal?.direction, 'up');
  assert.equal(buildPublicMarketSummaryText(signals), '국내 경유가격의 단기 상승 요인');
});

test('failed refresh keeps last-known-good values but marks checking and holds summary', () => {
  const signals = buildPublicMarketSignals([
    history('dubai', 76.9, 75.79, 'failed'),
    history('usd-krw', 1490, 1488.5),
  ]);

  assert.equal(signals[0]?.value, 76.9);
  assert.equal(signals[0]?.status, 'checking');
  assert.equal(buildPublicMarketSummaryText(signals), '시장 영향 판단 보류');
});

test('market summary handles down, mixed, and flat policies', () => {
  assert.equal(
    buildPublicMarketSummaryText(buildPublicMarketSignals([history('dubai', 74, 75), history('usd-krw', 1480, 1490)])),
    '국내 경유가격의 단기 하락 요인',
  );
  assert.equal(
    buildPublicMarketSummaryText(buildPublicMarketSignals([history('dubai', 76, 75), history('usd-krw', 1480, 1490)])),
    '상승·하락 요인이 혼재',
  );
  assert.equal(
    buildPublicMarketSummaryText(buildPublicMarketSignals([history('dubai', 75, 75), history('usd-krw', 1490, 1480)])),
    '국내 경유가격의 단기 상승 요인',
  );
  assert.equal(
    buildPublicMarketSummaryText(buildPublicMarketSignals([history('dubai', 75, 75), history('usd-krw', 1490, 1490)])),
    '두 지표 모두 보합으로 국내 경유가격의 단기 영향은 중립',
  );
});

test('market signal helpers calculate exact percent and direction rules', () => {
  assert.equal(calculatePercentChange(100, 98)?.toFixed(2), '2.04');
  assert.equal(calculateDirection(2.04), 'up');
  assert.equal(calculatePercentChange(95, 100)?.toFixed(2), '-5.00');
  assert.equal(calculateDirection(-5), 'down');
  assert.equal(calculatePercentChange(null, 100), null);
  assert.equal(calculatePercentChange(100, 0), null);
  assert.equal(calculateDirection(0), 'flat');
});

test('a signal with fewer than two valid daily rows is unavailable', () => {
  const dubai = history('dubai', 76.9, 75.79);
  dubai.rows = dubai.rows.slice(0, 1);
  const signals = buildPublicMarketSignals([dubai, history('usd-krw', 1490, 1488.5)]);

  assert.equal(signals[0]?.status, 'unavailable');
  assert.equal(buildPublicMarketSummaryText(signals), '시장 영향 판단 보류');
});
