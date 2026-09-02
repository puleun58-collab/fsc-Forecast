import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildForecastQualityTrend,
  FORECAST_QUALITY_CHART_LIMIT,
  type ForecastQualityMetric,
  type ForecastQualityMetricKey,
  type ForecastQualityResult,
  type ForecastQualityTrend,
} from './forecast-quality-trend';

function result(overrides: Partial<ForecastQualityResult> = {}): ForecastQualityResult {
  return {
    id: 'fsc-1',
    createdAt: '2026-09-02T02:00:00.000Z',
    recent13wWeeklyPriceMape: 1.47,
    recent13wWeeklyPriceMae: 22.5,
    recent4wWeeklyPriceMae: 21.34,
    recent26wWeeklyPriceMae: 24.81,
    recent13wDirectionAccuracy: 0.692,
    forecastBias4w: 4.21,
    forecastBias13w: 3.15,
    ...overrides,
  };
}

function metricOf(
  trend: ForecastQualityTrend,
  key: ForecastQualityMetricKey,
): ForecastQualityMetric | undefined {
  return [...trend.metrics, ...trend.detailMetrics].find((metric) => metric.key === key);
}

test('the five core metrics compare against the previous result of the same quarter', () => {
  const trend = buildForecastQualityTrend([
    result(),
    result({
      id: 'fsc-0',
      createdAt: '2026-09-01T02:00:00.000Z',
      recent13wWeeklyPriceMape: 1.59,
      recent4wWeeklyPriceMae: 23.48,
      recent26wWeeklyPriceMae: 23.96,
      recent13wDirectionAccuracy: 0.615,
      forecastBias4w: 5.53,
    }),
  ]);

  assert.deepEqual(
    trend.metrics.map((metric) => metric.label),
    ['최근 13주 MAPE', '최근 4주 MAE', '최근 26주 MAE', '방향 정확도', '최근 Bias'],
  );
  assert.equal(metricOf(trend, 'recent13wMape')?.direction, 'improved');
  assert.equal(metricOf(trend, 'recent13wMape')?.delta?.toFixed(2), '-0.12');
  assert.equal(metricOf(trend, 'recent4wMae')?.direction, 'improved');
  assert.equal(metricOf(trend, 'recent26wMae')?.direction, 'worsened');
  assert.equal(metricOf(trend, 'directionAccuracy')?.direction, 'improved');
  assert.equal(metricOf(trend, 'directionAccuracy')?.current?.toFixed(1), '69.2');
  assert.equal(metricOf(trend, 'directionAccuracy')?.delta?.toFixed(1), '7.7');
  assert.equal(metricOf(trend, 'bias4w')?.direction, 'improved');
  assert.equal(trend.status, 'improved');
});

test('bias direction follows the distance from zero, not the sign', () => {
  const closerFromPositive = buildForecastQualityTrend([
    result({ forecastBias4w: 5 }),
    result({ id: 'prev', forecastBias4w: 10 }),
  ]);
  const closerFromNegative = buildForecastQualityTrend([
    result({ forecastBias4w: -5 }),
    result({ id: 'prev', forecastBias4w: -10 }),
  ]);
  const fartherFromZero = buildForecastQualityTrend([
    result({ forecastBias4w: 10 }),
    result({ id: 'prev', forecastBias4w: 5 }),
  ]);
  const signFlipSameDistance = buildForecastQualityTrend([
    result({ forecastBias4w: -5 }),
    result({ id: 'prev', forecastBias4w: 5 }),
  ]);

  assert.equal(metricOf(closerFromPositive, 'bias4w')?.direction, 'improved');
  assert.equal(metricOf(closerFromNegative, 'bias4w')?.direction, 'improved');
  assert.equal(metricOf(fartherFromZero, 'bias4w')?.direction, 'worsened');
  assert.equal(metricOf(signFlipSameDistance, 'bias4w')?.direction, 'flat');
});

test('changes below the display precision count as unchanged', () => {
  const trend = buildForecastQualityTrend([
    result({ recent13wWeeklyPriceMape: 1.4701 }),
    result({ id: 'prev', recent13wWeeklyPriceMape: 1.4699 }),
  ]);

  assert.equal(metricOf(trend, 'recent13wMape')?.direction, 'flat');
  assert.equal(trend.status, 'flat');
});

test('a missing previous result or metric leaves the comparison unknown', () => {
  const withoutPrevious = buildForecastQualityTrend([result()]);
  const withoutMetric = buildForecastQualityTrend([
    result({ recent4wWeeklyPriceMae: null }),
    result({ id: 'prev', recent4wWeeklyPriceMae: 20 }),
  ]);

  assert.equal(metricOf(withoutPrevious, 'recent13wMape')?.direction, 'unknown');
  assert.equal(metricOf(withoutPrevious, 'recent13wMape')?.delta, null);
  assert.equal(metricOf(withoutPrevious, 'recent13wMape')?.current, 1.47);
  assert.equal(withoutPrevious.status, 'unknown');
  assert.equal(metricOf(withoutMetric, 'recent4wMae')?.current, null);
  assert.equal(metricOf(withoutMetric, 'recent4wMae')?.direction, 'unknown');
  assert.equal(metricOf(withoutMetric, 'recent13wMape')?.direction, 'flat');
});

test('a zero metric is compared as a real value instead of missing data', () => {
  const trend = buildForecastQualityTrend([
    result({ forecastBias4w: 0 }),
    result({ id: 'prev', forecastBias4w: 2 }),
  ]);

  assert.equal(metricOf(trend, 'bias4w')?.current, 0);
  assert.equal(metricOf(trend, 'bias4w')?.direction, 'improved');
});

test('the chart runs oldest to newest, drops null MAPE, and respects the limit', () => {
  const results = Array.from({ length: 14 }, (_, index) =>
    result({
      id: `fsc-${index}`,
      createdAt: new Date(Date.UTC(2026, 8, 14 - index)).toISOString(),
      recent13wWeeklyPriceMape: index === 3 ? null : 1 + index / 100,
    }),
  );
  const trend = buildForecastQualityTrend(results);

  assert.equal(trend.chart.length, FORECAST_QUALITY_CHART_LIMIT);
  assert.deepEqual(
    trend.chart.map((point) => point.createdAt),
    [...trend.chart].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map((point) => point.createdAt),
  );
  assert.equal(trend.chart.at(-1)?.createdAt, '2026-09-14T00:00:00.000Z');
  assert.equal(trend.chart.every((point) => Number.isFinite(point.mapePct)), true);
  assert.equal(
    trend.chart.some((point) => point.createdAt === results[3]!.createdAt),
    false,
  );
});

test('an empty result set yields no metrics values and no chart', () => {
  const trend = buildForecastQualityTrend([]);

  assert.equal(trend.status, 'unknown');
  assert.equal(trend.chart.length, 0);
  assert.equal(trend.metrics.every((metric) => metric.current === null), true);
});
