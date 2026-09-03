import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPerformanceDrift,
  DRIFT_SHORT_WINDOW_WEEKS,
  readPerformanceDrift,
  type PerformanceDrift,
} from "./performance-drift";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_TARGET = Date.UTC(2026, 0, 15);
const EVALUATED_AT = new Date("2026-06-01T00:00:00.000Z");

function point(
  index: number,
  errorKrwPerL: number,
  directionHit = true,
): WalkForwardEvaluationPoint {
  const targetDate = new Date(FIRST_TARGET + index * WEEK_MS);
  const actualKrwPerL = 2000;

  return {
    originWeekEndDate: new Date(targetDate.getTime() - WEEK_MS),
    targetDate,
    horizonIndex: 1,
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

/** 26주 중 마지막 몇 주만 오차를 키운 흐름. */
function series(recentErrors: readonly number[], baseError = 20, length = 26) {
  return Array.from({ length }, (_, index) => {
    const fromEnd = length - index;
    const recent = recentErrors[recentErrors.length - fromEnd];

    return point(index, recent ?? baseError);
  });
}

function build(
  points: readonly WalkForwardEvaluationPoint[],
  previous: PerformanceDrift | null = null,
) {
  return buildPerformanceDrift({ oneStepPoints: points, previous, evaluatedAt: EVALUATED_AT });
}

test("a steady error level reads as stable", () => {
  const drift = build(series([]));

  assert.equal(drift.status, "stable");
  assert.equal(drift.short.sampleCount, DRIFT_SHORT_WINDOW_WEEKS);
  assert.equal(drift.short.maeKrwPerL, 20);
  assert.equal(drift.medium.maeKrwPerL, 20);
});

test("a fresh rise in the recent window opens an observation, not an alert", () => {
  const drift = build(series([40, 40, 40, 40]));

  assert.equal(drift.status, "watch");
  assert.equal(drift.degradedWeekCount, 1);
  assert.ok(drift.reasons.includes("recent-mae-up"));
  assert.ok(drift.reasons.includes("recent-mape-up"));
});

test("a repeated rise across new weeks escalates to an alert", () => {
  const first = build(series([40, 40, 40, 40]));
  const second = build(series([40, 40, 40, 45], 20, 27), first);

  assert.equal(second.status, "alert");
  assert.equal(second.degradedWeekCount, 2);
  assert.ok(second.reasons.includes("repeated-degradation"));
});

test("rerunning on the same week never adds evidence", () => {
  const first = build(series([40, 40, 40, 40]));
  const repeated = build(series([40, 40, 40, 40]), first);

  assert.equal(repeated.degradedWeekCount, first.degradedWeekCount);
  assert.equal(repeated.status, "watch");
});

test("a single large miss is separated from a sustained rise", () => {
  const drift = build(series([20, 20, 20, 26]));

  assert.equal(drift.status, "stable");
  assert.ok(drift.reasons.includes("single-large-error"));
  assert.equal(drift.reasons.includes("repeated-degradation"), false);
});

test("a collapse in direction accuracy is reported as a side signal", () => {
  const points = series([]).map((entry, index, all) =>
    index >= all.length - DRIFT_SHORT_WINDOW_WEEKS
      ? point(index, entry.absoluteErrorKrwPerL, false)
      : entry,
  );
  const drift = build(points);

  assert.ok(drift.reasons.includes("direction-accuracy-down"));
  assert.equal(drift.short.directionAccuracyRatio, 0);
});

test("too few confirmed weeks hold the verdict back", () => {
  assert.equal(build(series([], 20, 3)).status, "undecided");
  assert.equal(build(series([], 20, 10)).status, "undecided");
  assert.deepEqual(build([]).reasons, ["insufficient-sample"]);
});

test("recovering back to the usual error level clears the evidence", () => {
  const degraded = build(series([40, 40, 40, 40]));
  const recovered = build(series([20, 20, 20, 20]), degraded);

  assert.equal(recovered.status, "stable");
  assert.equal(recovered.degradedWeekCount, 0);
});

test("the long window is reported next to the short and medium ones", () => {
  const drift = build(series([40, 40, 40, 40]));

  assert.equal(drift.long.windowWeeks, 26);
  assert.equal(drift.long.sampleCount, 26);
  assert.ok((drift.long.maeKrwPerL ?? 0) > 0);
});

test("stored drift round-trips and legacy runs read as null", () => {
  const drift = build(series([40, 40, 40, 40]));
  const stored = JSON.parse(JSON.stringify({ model: { performanceDrift: drift } })) as unknown;

  assert.deepEqual(readPerformanceDrift(stored), drift);
  assert.equal(readPerformanceDrift({ model: {} }), null);
});
