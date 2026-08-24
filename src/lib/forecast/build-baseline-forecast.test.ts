import assert from 'node:assert/strict';
import test from 'node:test';

import { ForecastHorizonKind } from '@prisma/client';

import { buildBaselineForecast } from './build-baseline-forecast';
import type { ForecastSeriesPoint } from './types';

function seriesPoint(
  horizonKind: ForecastHorizonKind,
  targetDate: string,
  pointKrwPerL: number,
): ForecastSeriesPoint {
  const date = new Date(`${targetDate}T00:00:00.000Z`);

  return {
    horizonKind,
    periodStart: date,
    periodEnd: date,
    targetDate: date,
    pointKrwPerL,
    sampleCount: 1,
  };
}

test('weekly forecast anchors on the latest actual and dampens the trend over longer horizons', () => {
  const result = buildBaselineForecast({
    horizonKind: ForecastHorizonKind.weekly,
    historicalPoints: [
      seriesPoint(ForecastHorizonKind.weekly, '2026-08-06', 100),
      seriesPoint(ForecastHorizonKind.weekly, '2026-08-13', 90),
    ],
    horizonCount: 4,
  });

  assert.equal(result.diagnostics.baselineLevelKrwPerL, 90);
  assert.deepEqual(
    result.projections.map((point) => point.pointKrwPerL),
    [80, 72.2, 66.116, 61.37],
  );

  const weeklyChanges = result.projections.map((point, index) =>
    point.pointKrwPerL - (index === 0 ? 90 : result.projections[index - 1].pointKrwPerL),
  );
  assert.ok(Math.abs(weeklyChanges[1]) < Math.abs(weeklyChanges[0]));
  assert.ok(Math.abs(weeklyChanges[2]) < Math.abs(weeklyChanges[1]));
});

test('monthly forecast keeps the existing mean-level linear projection', () => {
  const result = buildBaselineForecast({
    horizonKind: ForecastHorizonKind.monthly,
    historicalPoints: [
      seriesPoint(ForecastHorizonKind.monthly, '2026-07-31', 100),
      seriesPoint(ForecastHorizonKind.monthly, '2026-08-31', 90),
    ],
    horizonCount: 2,
  });

  assert.equal(result.diagnostics.baselineLevelKrwPerL, 95);
  assert.deepEqual(
    result.projections.map((point) => point.pointKrwPerL),
    [85, 75],
  );
});
