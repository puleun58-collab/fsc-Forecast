import assert from 'node:assert/strict';
import test from 'node:test';

import { buildForecastChartScale } from './forecast-chart-scale';

test('buildForecastChartScale rounds the current dashboard range to readable ticks', () => {
  assert.deepEqual(
    buildForecastChartScale([1500, 1960.02]),
    {
      min: 1400,
      max: 2000,
      ticks: [2000, 1800, 1600, 1400],
    },
  );
});

test('buildForecastChartScale keeps a useful range when all values are equal', () => {
  const scale = buildForecastChartScale([1500, 1500]);

  assert.ok(scale.min < 1500);
  assert.ok(scale.max > 1500);
  assert.ok(scale.ticks.includes(1500));
});

test('buildForecastChartScale rejects missing or invalid values', () => {
  assert.throws(() => buildForecastChartScale([]));
  assert.throws(() => buildForecastChartScale([1500, Number.NaN]));
});
