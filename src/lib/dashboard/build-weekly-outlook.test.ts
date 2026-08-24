import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWeeklyOutlook, type WeeklyOutlookForecastPoint } from './build-weekly-outlook';
import type { FscDashboardWeekItem } from './fsc-types';

function actualWeek(sequenceNo: number, price: number): FscDashboardWeekItem {
  const start = new Date(Date.UTC(2026, 6, 5 + (sequenceNo - 1) * 7));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 4);

  return {
    sequenceNo,
    targetMonth: 7,
    weekNo: 27 + sequenceNo,
    weekStartDate: start.toISOString(),
    weekEndDate: end.toISOString(),
    priceKind: 'actual',
    priceKrwPerL: price.toFixed(2),
    actualPriceKrwPerL: price.toFixed(2),
    forecastPriceKrwPerL: null,
    forecastSourceKind: null,
    fallbackUsed: false,
    priceDiffKrwPerL: (price - 1_500).toFixed(2),
    diffRatio: ((price - 1_500) / 1_500).toFixed(6),
  };
}

function forecastPoint(horizonIndex: number): WeeklyOutlookForecastPoint {
  const targetDate = new Date(Date.UTC(2026, 7, 6));
  targetDate.setUTCDate(targetDate.getUTCDate() + (horizonIndex - 1) * 7);
  const price = 1_860 + horizonIndex;

  return {
    horizonKind: 'weekly',
    horizonIndex,
    targetDate,
    pointKrwPerL: price,
    lowerBoundKrwPerL: price - horizonIndex,
    upperBoundKrwPerL: price + horizonIndex,
  };
}

test('최근 actual 4주와 forecast 13주로 주간 전망을 구성한다', () => {
  const result = buildWeeklyOutlook({
    actualWeeks: Array.from({ length: 6 }, (_, index) => actualWeek(index + 1, 1_850 + index)),
    forecastPoints: Array.from({ length: 13 }, (_, index) => forecastPoint(index + 1)),
    basePriceKrwPerL: '1500.00',
  });

  assert.equal(result.actualWeekCount, 4);
  assert.equal(result.forecastWeekCount, 13);
  assert.equal(result.weeks.length, 17);
  assert.equal(result.weeks[0]?.priceKrwPerL, '1852.00');
  assert.equal(result.weeks[4]?.horizonIndex, 1);
  assert.equal(result.weeks[8]?.confidence, 'medium');
  assert.equal(result.weeks[16]?.confidence, 'long');
  assert.equal(result.forecastAverageKrwPerL, '1867.00');
  assert.equal(result.forecastMinKrwPerL, '1860.00');
  assert.equal(result.forecastMaxKrwPerL, '1886.00');
  assert.equal(result.hasConfidenceBounds, true);
  assert.equal(result.direction, 'up');
});

test('예측 포인트가 없으면 actual 문맥만 제공한다', () => {
  const result = buildWeeklyOutlook({
    actualWeeks: [actualWeek(1, 1_850)],
    forecastPoints: [],
    basePriceKrwPerL: '1500.00',
  });

  assert.equal(result.forecastWeekCount, 0);
  assert.equal(result.forecastAverageKrwPerL, null);
  assert.equal(result.forecastMinKrwPerL, null);
  assert.equal(result.forecastMaxKrwPerL, null);
  assert.equal(result.hasConfidenceBounds, false);
  assert.equal(result.direction, 'flat');
});
