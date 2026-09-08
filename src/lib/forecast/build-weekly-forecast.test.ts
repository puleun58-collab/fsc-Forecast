import assert from 'node:assert/strict';
import test from 'node:test';

import { ForecastHorizonKind } from '@prisma/client';

import {
  buildWeeklyForecast,
  projectWeeklyPrice,
  type ForecastIndicatorWeeklyPoint,
} from './build-weekly-forecast';
import {
  FALLBACK_FORECAST_MODEL_PARAMS,
  type ForecastModelParams,
} from './forecast-model-config';
import type { ForecastSeriesPoint } from './types';

const WEEK_MS = 604_800_000;

function createWeeklySeries(prices: readonly number[], firstWeekEnd = '2026-05-07'): ForecastSeriesPoint[] {
  const firstDate = new Date(`${firstWeekEnd}T00:00:00.000Z`);

  return prices.map((price, index) => {
    const targetDate = new Date(firstDate.getTime() + WEEK_MS * index);

    return {
      horizonKind: ForecastHorizonKind.weekly,
      periodStart: new Date(targetDate.getTime() - WEEK_MS + 86_400_000),
      periodEnd: targetDate,
      targetDate,
      pointKrwPerL: price,
      sampleCount: 5,
    };
  });
}

function createIndicatorSeries(
  values: readonly number[],
  firstWeekEnd = '2026-05-07',
): ForecastIndicatorWeeklyPoint[] {
  const firstDate = new Date(`${firstWeekEnd}T00:00:00.000Z`);

  return values.map((value, index) => {
    const weekEndDate = new Date(firstDate.getTime() + WEEK_MS * index);
    return { weekEndDate, observedAt: weekEndDate, value };
  });
}

test('weekly forecast anchors on the latest actual and extends the recent trend', () => {
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880, 1860, 1840]),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    horizonCount: 3,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.anchorPriceKrwPerL, 1840);
  assert.equal(result.trendDeltaKrwPerL, -20);
  assert.deepEqual(
    result.points.map((point) => point.pointKrwPerL),
    [1820, 1800, 1780],
  );
  assert.equal(result.points[0].targetDate.toISOString().slice(0, 10), '2026-06-04');
  assert.equal(result.externalAdjustmentRatio, 0);
});

test('weekly forecast uses only the last eight actual weeks for the trend', () => {
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1500, 1500, 1900, 1890, 1880, 1870, 1860, 1850, 1840, 1830]),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    horizonCount: 1,
  });

  assert.equal(result.trendLookbackCount, 8);
  assert.equal(result.trendDeltaKrwPerL, -10);
  assert.equal(result.points[0].pointKrwPerL, 1820);
});

test('dubai adjustment applies its own lag weight and direction', () => {
  const params: ForecastModelParams = {
    ...FALLBACK_FORECAST_MODEL_PARAMS,
    modelId: 'B',
    dubai: { lagWeeks: 2, weight: 0.2 },
    externalAdjustmentCapRatio: 0.03,
  };
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880, 1860, 1840]),
    indicatorSeries: {
      dubai: createIndicatorSeries([80, 80, 88, 60]),
      usdKrw: [],
    },
    params,
    horizonCount: 1,
  });

  assert.equal(result.dubai?.lagWeeks, 2);
  assert.equal(result.dubai?.basisWeekEndDate?.toISOString().slice(0, 10), '2026-05-21');
  assert.equal(result.dubai?.changeRatio?.toFixed(4), '0.1000');
  assert.equal(result.dubai?.contributionRatio.toFixed(4), '0.0200');
  assert.equal(result.externalAdjustmentRatio.toFixed(4), '0.0200');
  assert.equal(result.points[0].pointKrwPerL, 1856.4);
});

test('usd-krw adjustment stays independent from dubai and is not averaged', () => {
  const params: ForecastModelParams = {
    ...FALLBACK_FORECAST_MODEL_PARAMS,
    modelId: 'C',
    dubai: { lagWeeks: 1, weight: 0.1 },
    usdKrw: { lagWeeks: 1, weight: 0.1 },
    externalAdjustmentCapRatio: 0.03,
  };
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880, 1860, 1840]),
    indicatorSeries: {
      dubai: createIndicatorSeries([80, 80, 80, 88]),
      usdKrw: createIndicatorSeries([1300, 1300, 1300, 1287]),
    },
    params,
    horizonCount: 1,
  });

  assert.equal(result.dubai?.contributionRatio.toFixed(4), '0.0100');
  assert.equal(result.usdKrw?.contributionRatio.toFixed(4), '-0.0010');
  assert.equal(result.externalAdjustmentRatio.toFixed(4), '0.0090');
});

test('external adjustment is capped by the configured ratio', () => {
  const params: ForecastModelParams = {
    ...FALLBACK_FORECAST_MODEL_PARAMS,
    modelId: 'C',
    dubai: { lagWeeks: 1, weight: 0.2 },
    usdKrw: { lagWeeks: 1, weight: 0.1 },
    externalAdjustmentCapRatio: 0.01,
  };
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880, 1860, 1840]),
    indicatorSeries: {
      dubai: createIndicatorSeries([80, 80, 80, 100]),
      usdKrw: createIndicatorSeries([1300, 1300, 1300, 1400]),
    },
    params,
    horizonCount: 2,
  });

  assert.equal(result.externalAdjustmentCapReached, true);
  assert.equal(result.externalAdjustmentRatio, 0.01);
  assert.equal(result.points[0].pointKrwPerL, 1838.2);
});

test('one external signal ratio is applied exactly once across all thirteen horizons', () => {
  const params: ForecastModelParams = {
    ...FALLBACK_FORECAST_MODEL_PARAMS,
    modelId: 'B',
    dubai: { lagWeeks: 1, weight: 0.1 },
    externalAdjustmentCapRatio: 0.03,
  };
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880, 1860, 1840]),
    indicatorSeries: {
      dubai: createIndicatorSeries([80, 80, 80, 88]),
      usdKrw: [],
    },
    params,
    horizonCount: 13,
  });

  assert.equal(result.externalAdjustmentRatio.toFixed(4), '0.0100');
  assert.equal(result.externalAdjustmentCapReached, false);
  assert.deepEqual(
    result.points.map((point) => point.pointKrwPerL),
    [
      1838.2, 1818, 1797.8, 1777.6, 1757.4, 1737.2, 1717, 1696.8, 1676.6, 1656.4,
      1636.2, 1616, 1595.8,
    ],
  );
  result.points.forEach((point, index) => {
    assert.equal(
      point.pointKrwPerL,
      projectWeeklyPrice(1840, -20, index + 1, result.externalAdjustmentRatio),
    );
  });
  assert.notEqual(result.points[0].pointKrwPerL, Number((1820 * 1.01 * 1.01).toFixed(3)));
});

test('expected range comes from horizon backtest errors, not from horizon distance', () => {
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880, 1860, 1840]),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    horizonCount: 3,
    absoluteErrorByHorizon: new Map([
      [1, 12],
      [2, 9],
    ]),
  });

  assert.equal(result.points[0].lowerBoundKrwPerL, 1808);
  assert.equal(result.points[0].upperBoundKrwPerL, 1832);
  assert.equal(result.points[1].lowerBoundKrwPerL, 1791);
  assert.equal(result.points[1].upperBoundKrwPerL, 1809);
  assert.equal(result.points[2].lowerBoundKrwPerL, null);
  assert.equal(result.points[2].upperBoundKrwPerL, null);
});

test('insufficient weekly actuals leave the forecast pending instead of guessing', () => {
  const result = buildWeeklyForecast({
    weeklySeries: createWeeklySeries([1900, 1880]),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    horizonCount: 4,
  });

  assert.equal(result.status, 'pending');
  assert.match(result.pendingReason ?? '', /insufficient_weekly_actuals/);
  assert.deepEqual(result.points, []);
});
