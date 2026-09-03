import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHorizonPerformance,
  HORIZON_MIN_SAMPLE_COUNT,
  readHorizonPerformance,
} from "./horizon-performance";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_ORIGIN = Date.UTC(2026, 0, 8);
const EVALUATED_AT = new Date("2026-06-01T00:00:00.000Z");

function point(
  originIndex: number,
  horizonIndex: number,
  errorKrwPerL: number,
  directionHit = true,
): WalkForwardEvaluationPoint {
  const originWeekEndDate = new Date(FIRST_ORIGIN + originIndex * WEEK_MS);
  const actualKrwPerL = 2000;

  return {
    originWeekEndDate,
    targetDate: new Date(originWeekEndDate.getTime() + horizonIndex * WEEK_MS),
    horizonIndex,
    anchorKrwPerL: 1990,
    actualKrwPerL,
    forecastKrwPerL: actualKrwPerL - errorKrwPerL,
    absoluteErrorKrwPerL: Math.abs(errorKrwPerL),
    absolutePercentageErrorPct: (Math.abs(errorKrwPerL) / actualKrwPerL) * 100,
    actualDirection: "up",
    forecastDirection: directionHit ? "up" : "down",
    trendDeltaKrwPerL: 2,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
  };
}

/** H1은 20원, 이후 예측 거리마다 10원씩 커지는 흐름. */
function ladder(sampleCountByHorizon: (horizon: number) => number, horizonCount = 13) {
  return Array.from({ length: horizonCount }, (_, index) => index + 1).flatMap((horizon) =>
    Array.from({ length: sampleCountByHorizon(horizon) }, (_, originIndex) =>
      point(originIndex, horizon, 10 + horizon * 10),
    ),
  );
}

function build(points: readonly WalkForwardEvaluationPoint[], horizonCount = 13) {
  return buildHorizonPerformance({
    evaluationPoints: points,
    horizonCount,
    evaluatedAt: EVALUATED_AT,
  });
}

test("each prediction distance is measured separately, never pooled into one number", () => {
  const profile = build(ladder(() => 13));

  assert.deepEqual(
    profile.horizons.map((entry) => [entry.horizonWeeks, entry.maeKrwPerL]),
    Array.from({ length: 13 }, (_, index) => [index + 1, 20 + index * 10]),
  );
  assert.equal(profile.horizons[0].sampleCount, 13);
});

test("only weeks with a confirmed actual are counted, and short horizons keep more samples", () => {
  const profile = build(ladder((horizon) => Math.max(0, 26 - horizon)));

  assert.equal(profile.horizons[0].sampleCount, 25);
  assert.equal(profile.horizons[12].sampleCount, 13);
  assert.equal(profile.horizons.length, 13);
});

test("mape, max error and direction accuracy are reported per distance", () => {
  const points = [
    point(0, 1, 20),
    point(1, 1, 40, false),
    point(2, 1, 30),
    point(3, 1, 30),
    point(4, 1, 30),
  ];
  const [first] = build(points, 1).horizons;

  assert.equal(first.maeKrwPerL, 30);
  assert.equal(first.maxAbsoluteErrorKrwPerL, 40);
  assert.equal(first.mapePct, 1.5);
  assert.equal(first.directionAccuracyRatio, 0.8);
});

test("a distance with too few weeks is flagged instead of judged", () => {
  const profile = build([
    ...ladder(() => 13, 1),
    ...Array.from({ length: HORIZON_MIN_SAMPLE_COUNT - 1 }, (_, index) => point(index, 2, 25)),
  ], 2);

  assert.equal(profile.horizons[1].status, "insufficient-sample");
  assert.equal(profile.horizons[0].status, "stable");
});

test("distances stay in their own bucket even when targets overlap", () => {
  const profile = build([...Array.from({ length: 13 }, (_, index) => point(index + 12, 1, 20)), ...ladder(() => 13, 13).filter((entry) => entry.horizonIndex === 13)], 13);
  const first = profile.horizons.find((entry) => entry.horizonWeeks === 1);
  const last = profile.horizons.find((entry) => entry.horizonWeeks === 13);

  assert.equal(first?.maeKrwPerL, 20);
  assert.equal(last?.maeKrwPerL, 140);
});

test("bands summarize without replacing the individual distances", () => {
  const profile = build(ladder(() => 13));

  assert.deepEqual(
    profile.bands.map((band) => [band.band, band.maeKrwPerL]),
    [
      ["near", 35],
      ["mid", 75],
      ["long", 120],
    ],
  );
  assert.equal(profile.horizons.length, 13);
});

test("the degradation start is reported once the error stays clearly higher", () => {
  const profile = build(ladder(() => 13));

  assert.equal(profile.degradationStartHorizonWeeks, 5);
});

test("a flat error profile reports no clear degradation point", () => {
  const flat = Array.from({ length: 13 }, (_, horizonIndex) => horizonIndex + 1).flatMap((horizon) =>
    Array.from({ length: 13 }, (_, originIndex) => point(originIndex, horizon, 20)),
  );
  const profile = build(flat);

  assert.equal(profile.degradationStartHorizonWeeks, null);
  assert.ok(profile.horizons.every((entry) => entry.status === "stable"));
});

test("the pooled reference matches the individual distances it came from", () => {
  const points = ladder(() => 13);
  const profile = build(points);
  const expectedMae =
    points.reduce((total, entry) => total + entry.absoluteErrorKrwPerL, 0) / points.length;

  assert.equal(profile.overall.sampleCount, points.length);
  assert.equal(profile.overall.maeKrwPerL, Math.round(expectedMae * 100) / 100);
});

test("the same inputs always produce the same profile", () => {
  assert.deepEqual(build(ladder(() => 13)), build(ladder(() => 13)));
});

test("stored profiles round-trip and legacy runs read as null", () => {
  const profile = build(ladder(() => 13));
  const stored = JSON.parse(JSON.stringify({ model: { horizonPerformance: profile } })) as unknown;

  assert.deepEqual(readHorizonPerformance(stored), profile);
  assert.equal(readHorizonPerformance({ model: {} }), null);
});
