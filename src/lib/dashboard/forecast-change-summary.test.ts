import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildForecastChangeReason,
  buildForecastChangeSummary,
} from './forecast-change-summary';

test('forecast comparison uses the previous same-quarter result and detects a new actual week', () => {
  const summary = buildForecastChangeSummary({
    currentQuarterAverageKrwPerL: 1684.32,
    previousQuarterAverageKrwPerL: 1675.91,
    previousActualWeeks: [
      { weekStartDate: '2026-08-16', weekEndDate: '2026-08-20' },
    ],
    currentActualWeeks: [
      { weekStartDate: '2026-08-16', weekEndDate: '2026-08-20' },
      { weekStartDate: '2026-08-23', weekEndDate: '2026-08-27' },
    ],
    marketSignals: [
      { indicatorCode: 'dubai', status: 'ready', direction: 'up' },
      { indicatorCode: 'usd-krw', status: 'ready', direction: 'up' },
    ],
  });

  assert.equal(summary.absoluteChangeKrwPerL, 8.41);
  assert.equal(summary.direction, 'up');
  assert.equal(summary.newActualWeekCount, 1);
  assert.equal(summary.newActualWeekLabel, '8월 4주차');
  assert.equal(
    summary.summaryText,
    '두바이유 상승과 신규 Actual 값 반영이 이번 전망의 주요 상방 요인입니다.',
  );
});

test('forecast reason follows the mixed Dubai and exchange-rate rule', () => {
  assert.equal(
    buildForecastChangeReason({
      comparisonAvailable: true,
      forecastDirection: 'up',
      dubaiDirection: 'down',
      usdKrwDirection: 'up',
      hasNewActual: false,
    }),
    '두바이유 하락 영향이 있었지만 환율 상승이 일부 상쇄했습니다.',
  );
});

test('forecast reason handles both rising indicators without free-form generation', () => {
  assert.equal(
    buildForecastChangeReason({
      comparisonAvailable: true,
      forecastDirection: 'up',
      dubaiDirection: 'up',
      usdKrwDirection: 'up',
      hasNewActual: false,
    }),
    '두바이유와 환율 상승이 이번 전망의 주요 상방 요인입니다.',
  );
});

test('forecast reason uses the same rule structure for downward movement', () => {
  assert.equal(
    buildForecastChangeReason({
      comparisonAvailable: true,
      forecastDirection: 'down',
      dubaiDirection: 'down',
      usdKrwDirection: 'flat',
      hasNewActual: true,
    }),
    '두바이유 하락과 신규 Actual 값 반영이 이번 전망의 주요 하방 요인입니다.',
  );
});

test('forecast comparison fails closed when no previous run exists', () => {
  const summary = buildForecastChangeSummary({
    currentQuarterAverageKrwPerL: 1684.32,
    previousQuarterAverageKrwPerL: null,
    previousActualWeeks: [],
    currentActualWeeks: [
      { weekStartDate: '2026-08-23', weekEndDate: '2026-08-27' },
    ],
    marketSignals: [],
  });

  assert.equal(summary.comparisonStatus, 'unavailable');
  assert.equal(summary.absoluteChangeKrwPerL, null);
  assert.equal(summary.newActualWeekCount, 0);
  assert.equal(summary.newActualWeekLabel, null);
  assert.equal(
    summary.summaryText,
    '지난 전망과 비교할 데이터가 없어 변화 원인은 산정하지 않았습니다.',
  );
});
