import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPredictionIntervalBounds,
  buildPredictionIntervalCalibration,
  collectCalibrationResiduals,
  PREDICTION_INTERVAL_TARGET_COVERAGE,
  readPredictionIntervalCalibration,
} from "./prediction-interval";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_ORIGIN = Date.UTC(2026, 0, 8);
const EVALUATED_AT = new Date("2026-06-01T00:00:00.000Z");

function point(
  originIndex: number,
  horizonIndex: number,
  residual: number,
): WalkForwardEvaluationPoint {
  const originWeekEndDate = new Date(FIRST_ORIGIN + originIndex * WEEK_MS);
  const forecastKrwPerL = 2000;
  const actualKrwPerL = forecastKrwPerL + residual;

  return {
    originWeekEndDate,
    targetDate: new Date(originWeekEndDate.getTime() + horizonIndex * WEEK_MS),
    horizonIndex,
    anchorKrwPerL: 1990,
    actualKrwPerL,
    forecastKrwPerL,
    absoluteErrorKrwPerL: Math.abs(residual),
    absolutePercentageErrorPct: (Math.abs(residual) / actualKrwPerL) * 100,
    actualDirection: "up",
    forecastDirection: "up",
    trendDeltaKrwPerL: 2,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
  };
}

function build(points: readonly WalkForwardEvaluationPoint[], horizonCount = 13) {
  return buildPredictionIntervalCalibration({
    evaluationPoints: points,
    horizonCount,
    evaluatedAt: EVALUATED_AT,
  });
}

test("the interval comes from residual quantiles and may be asymmetric", () => {
  const residuals = [-60, -40, -20, -10, 0, 10, 20, 40, 70, 90];
  const bounds = buildPredictionIntervalBounds(2050, residuals, "horizon");

  assert.ok(bounds !== null);
  assert.equal(bounds.lowerKrwPerL < 2050, true);
  assert.equal(bounds.upperKrwPerL > 2050, true);
  assert.notEqual(
    Math.abs(bounds.lowerResidualQuantileKrwPerL),
    Math.abs(bounds.upperResidualQuantileKrwPerL),
  );
  assert.equal(bounds.calibrationSampleCount, residuals.length);
});

test("the target coverage is configurable and widens the band", () => {
  const residuals = Array.from({ length: 21 }, (_, index) => index - 10);
  const eighty = buildPredictionIntervalBounds(2000, residuals, "horizon", 0.8);
  const ninety = buildPredictionIntervalBounds(2000, residuals, "horizon", 0.9);

  assert.equal(PREDICTION_INTERVAL_TARGET_COVERAGE, 0.8);
  assert.ok(
    (ninety?.upperKrwPerL ?? 0) - (ninety?.lowerKrwPerL ?? 0) >
      (eighty?.upperKrwPerL ?? 0) - (eighty?.lowerKrwPerL ?? 0),
  );
});

test("calibration falls back to the band and then to every horizon", () => {
  const history = [
    ...Array.from({ length: 10 }, (_, index) => point(index, 2, index - 5)),
    ...Array.from({ length: 3 }, (_, index) => point(index, 6, index)),
  ];

  assert.equal(collectCalibrationResiduals(history, 2).source, "horizon");
  assert.equal(collectCalibrationResiduals(history, 1).source, "band");
  assert.equal(collectCalibrationResiduals(history, 12).source, "pooled");
  assert.equal(collectCalibrationResiduals(history.slice(0, 3), 12).source, "none");
});

test("an interval never sees a residual confirmed after its own origin", () => {
  const early = Array.from({ length: 12 }, (_, index) => point(index, 1, 5));
  const late = [...early, point(20, 1, 400), point(21, 1, -400)];
  const withoutLate = build(early, 1).horizons[0];
  const withLate = build(late, 1).horizons[0];

  assert.equal(withLate.coverageHitCount >= withoutLate.coverageHitCount, true);
  assert.equal(withLate.averageIntervalWidthKrwPerL, withoutLate.averageIntervalWidthKrwPerL);
});

test("a value on the boundary counts as a hit", () => {
  const residuals = [-10, -10, -10, -10, 10, 10, 10, 10, 10, 10];
  const bounds = buildPredictionIntervalBounds(2000, residuals, "horizon");

  assert.ok(bounds !== null);
  assert.equal(bounds.lowerKrwPerL <= 1990, true);
  assert.equal(bounds.upperKrwPerL >= 2010, true);
});

test("coverage is counted per distance and weighted overall", () => {
  const points = [
    ...Array.from({ length: 14 }, (_, index) => point(index, 1, index % 2 === 0 ? 5 : -5)),
    ...Array.from({ length: 14 }, (_, index) => point(index, 2, index % 2 === 0 ? 8 : -8)),
  ];
  const calibration = build(points, 2);
  const [first, second] = calibration.horizons;

  assert.equal(first.horizonWeeks, 1);
  assert.equal(second.horizonWeeks, 2);
  assert.equal(
    calibration.weightedCoverageSampleCount,
    first.coverageSampleCount + second.coverageSampleCount,
  );
  assert.ok((calibration.weightedCoverageRatio ?? 0) > 0);
});

test("a band that is too tight for the real errors reports as too narrow", () => {
  const points = Array.from({ length: 24 }, (_, index) =>
    point(index, 1, index < 10 ? 1 : index % 2 === 0 ? 120 : -120),
  );
  const [first] = build(points, 1).horizons;

  assert.equal(first.status, "too-narrow");
  assert.ok((first.coverageRatio ?? 1) < PREDICTION_INTERVAL_TARGET_COVERAGE);
});

test("a few confirmed weeks report as still validating instead of a verdict", () => {
  const points = Array.from({ length: 10 }, (_, index) => point(index, 1, 5));
  const [first] = build(points, 1).horizons;

  assert.ok(["validating", "insufficient-sample"].includes(first.status));
});

test("the average interval width is reported next to the hit rate", () => {
  const points = Array.from({ length: 20 }, (_, index) => point(index, 1, index % 3 === 0 ? 30 : -20));
  const [first] = build(points, 1).horizons;

  assert.ok((first.averageIntervalWidthKrwPerL ?? 0) > 0);
  assert.equal(first.source, "horizon");
});

test("the same run produces the same calibration twice", () => {
  const points = Array.from({ length: 20 }, (_, index) => point(index, 1, index - 10));

  assert.deepEqual(build(points, 1), build(points, 1));
});

test("stored calibration round-trips and legacy runs read as null", () => {
  const calibration = build(Array.from({ length: 20 }, (_, index) => point(index, 1, index - 10)), 1);
  const stored = JSON.parse(
    JSON.stringify({ model: { predictionInterval: calibration } }),
  ) as unknown;

  assert.deepEqual(readPredictionIntervalCalibration(stored), calibration);
  assert.equal(readPredictionIntervalCalibration({ model: {} }), null);
});
