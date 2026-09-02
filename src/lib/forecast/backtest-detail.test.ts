import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKTEST_DETAIL_STORED_LIMIT,
  buildBacktestDetail,
  readBacktestOneStepPoints,
  serializeBacktestOneStepPoints,
  type BacktestDetailPoint,
} from './backtest-detail';
import type { WalkForwardEvaluationPoint } from './run-walk-forward-backtest';

function evaluationPoint(index: number): WalkForwardEvaluationPoint {
  return {
    originWeekEndDate: new Date(Date.UTC(2026, 0, 2 + index * 7)),
    targetDate: new Date(Date.UTC(2026, 0, 9 + index * 7)),
    horizonIndex: 1,
    anchorKrwPerL: 1800,
    actualKrwPerL: 1820,
    forecastKrwPerL: 1800 + index,
    absoluteErrorKrwPerL: Math.abs(1820 - (1800 + index)),
    absolutePercentageErrorPct: (Math.abs(1820 - (1800 + index)) / 1820) * 100,
    actualDirection: 'up',
    forecastDirection: index % 2 === 0 ? 'up' : 'down',
    trendDeltaKrwPerL: 1,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
  };
}

function detailPoint(overrides: Partial<BacktestDetailPoint> = {}): BacktestDetailPoint {
  return {
    targetDate: '2026-08-14T00:00:00.000Z',
    originWeekEndDate: '2026-08-07T00:00:00.000Z',
    anchorKrwPerL: 1800,
    actualKrwPerL: 1820,
    forecastKrwPerL: 1800,
    absoluteErrorKrwPerL: 20,
    absolutePercentageErrorPct: 1.0989,
    actualDirection: 'up',
    forecastDirection: 'up',
    ...overrides,
  };
}

test('serialization keeps only the most recent stored window', () => {
  const points = serializeBacktestOneStepPoints(
    Array.from({ length: 40 }, (_, index) => evaluationPoint(index)),
  );

  assert.equal(points.length, BACKTEST_DETAIL_STORED_LIMIT);
  assert.equal(points.at(-1)?.targetDate, evaluationPoint(39).targetDate.toISOString());
  assert.equal(points[0]?.targetDate, evaluationPoint(14).targetDate.toISOString());
});

test('the detail view keeps the latest thirteen weeks in chronological order', () => {
  const shuffled = Array.from({ length: 20 }, (_, index) =>
    detailPoint({
      targetDate: new Date(Date.UTC(2026, 4, 1 + index * 7)).toISOString(),
      forecastKrwPerL: 1800 + index,
      absoluteErrorKrwPerL: Math.abs(1820 - (1800 + index)),
    }),
  ).sort(() => -1);
  const detail = buildBacktestDetail(shuffled);

  assert.equal(detail.rows.length, 13);
  assert.deepEqual(
    detail.rows.map((row) => row.targetDate),
    [...detail.rows].sort((left, right) => left.targetDate.localeCompare(right.targetDate)).map((row) => row.targetDate),
  );
  assert.equal(detail.rows.at(-1)?.targetDate, new Date(Date.UTC(2026, 4, 1 + 19 * 7)).toISOString());
});

test('signed error keeps the direction of the miss while MAE stays absolute', () => {
  const detail = buildBacktestDetail([
    detailPoint({ targetDate: '2026-08-07T00:00:00.000Z', forecastKrwPerL: 1800, actualKrwPerL: 1820 }),
    detailPoint({ targetDate: '2026-08-14T00:00:00.000Z', forecastKrwPerL: 1840, actualKrwPerL: 1820 }),
  ]);

  assert.equal(detail.rows[0]?.signedErrorKrwPerL, -20);
  assert.equal(detail.rows[1]?.signedErrorKrwPerL, 20);
  assert.equal(detail.summary?.maeKrwPerL, 20);
});

test('direction hit compares the recorded actual and forecast directions', () => {
  const detail = buildBacktestDetail([
    detailPoint({ targetDate: '2026-08-07T00:00:00.000Z', actualDirection: 'up', forecastDirection: 'up' }),
    detailPoint({ targetDate: '2026-08-14T00:00:00.000Z', actualDirection: 'up', forecastDirection: 'down' }),
  ]);

  assert.equal(detail.rows[0]?.directionHit, true);
  assert.equal(detail.rows[1]?.directionHit, false);
  assert.equal(detail.summary?.directionHitCount, 1);
});

test('the summary matches the aggregate of the displayed rows', () => {
  const points = [12, 8, 30].map((error, index) =>
    detailPoint({
      targetDate: new Date(Date.UTC(2026, 6, 3 + index * 7)).toISOString(),
      forecastKrwPerL: 1820 - error,
      absoluteErrorKrwPerL: error,
      absolutePercentageErrorPct: (error / 1820) * 100,
    }),
  );
  const detail = buildBacktestDetail(points);
  const expectedMae = (12 + 8 + 30) / 3;
  const expectedMape = ((12 / 1820) * 100 + (8 / 1820) * 100 + (30 / 1820) * 100) / 3;

  assert.equal(detail.summary?.sampleCount, 3);
  assert.ok(Math.abs((detail.summary?.maeKrwPerL ?? 0) - expectedMae) < 1e-9);
  assert.ok(Math.abs((detail.summary?.mapePct ?? 0) - expectedMape) < 1e-9);
  assert.equal(detail.summary?.maxAbsoluteErrorKrwPerL, 30);
  assert.equal(detail.rows.filter((row) => row.highlighted).length, 3);
});

test('metadata without stored points reads as an empty detail', () => {
  assert.deepEqual(readBacktestOneStepPoints(null), []);
  assert.deepEqual(readBacktestOneStepPoints({ model: {} }), []);
  assert.deepEqual(buildBacktestDetail([]), { rows: [], summary: null });
  assert.equal(readBacktestOneStepPoints({ model: { backtestOneStepPoints: [detailPoint()] } }).length, 1);
});
