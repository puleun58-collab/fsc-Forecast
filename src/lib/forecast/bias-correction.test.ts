import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBiasCorrection,
  buildBiasCandidateParams,
  buildBiasCorrectedBacktest,
  summarizeBiasState,
} from "./bias-correction";
import { FALLBACK_FORECAST_MODEL_PARAMS } from "./forecast-model-config";
import type { RunWalkForwardBacktestResult, WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_ORIGIN = Date.UTC(2026, 0, 8);

function point(
  index: number,
  forecastKrwPerL: number,
  actualKrwPerL: number,
  overrides: Partial<WalkForwardEvaluationPoint> = {},
): WalkForwardEvaluationPoint {
  const originWeekEndDate = new Date(FIRST_ORIGIN + index * WEEK_MS);

  return {
    originWeekEndDate,
    targetDate: new Date(originWeekEndDate.getTime() + WEEK_MS),
    horizonIndex: 1,
    anchorKrwPerL: actualKrwPerL,
    actualKrwPerL,
    forecastKrwPerL,
    absoluteErrorKrwPerL: Math.abs(forecastKrwPerL - actualKrwPerL),
    absolutePercentageErrorPct: (Math.abs(forecastKrwPerL - actualKrwPerL) / actualKrwPerL) * 100,
    actualDirection: "flat",
    forecastDirection: "flat",
    trendDeltaKrwPerL: 0,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
    ...overrides,
  };
}

/** 4주 연속 20원씩 과대 예측한 흐름. */
const OVER_FORECAST = [0, 1, 2, 3, 4].map((index) => point(index, 2020, 2000));

test("a one-sided recent error is reported as a persistent bias", () => {
  const state = summarizeBiasState(OVER_FORECAST);

  assert.equal(state.direction, "over-forecast");
  assert.equal(state.meanSignedErrorKrwPerL, 20);
  assert.equal(state.sameDirectionRatio, 1);
  assert.equal(state.persistent, true);
});

test("alternating errors are not treated as a bias worth correcting", () => {
  const state = summarizeBiasState([
    point(0, 2020, 2000),
    point(1, 1980, 2000),
    point(2, 2020, 2000),
    point(3, 1980, 2000),
  ]);

  assert.equal(state.direction, "none");
  assert.equal(state.persistent, false);
});

test("too few next-week results never look persistent", () => {
  const state = summarizeBiasState(OVER_FORECAST.slice(0, 3));

  assert.equal(state.sampleCount, 3);
  assert.equal(state.persistent, false);
});

test("each origin only reverses the bias measured before it", () => {
  const corrected = applyBiasCorrection(OVER_FORECAST, { lookbackWeeks: 4, weight: 0.5 });

  assert.deepEqual(
    corrected.slice(0, 4).map((entry) => entry.forecastKrwPerL),
    [2020, 2020, 2020, 2020],
  );
  assert.equal(corrected[4].forecastKrwPerL, 2010);
  assert.equal(corrected[4].absoluteErrorKrwPerL, 10);
});

test("the corrected backtest keeps the base run intact and only rescores next-week points", () => {
  const base: RunWalkForwardBacktestResult = {
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    recent: null as never,
    long: null as never,
    recentOneStep: {
      windowWeeks: 13,
      sampleCount: 5,
      maeKrwPerL: 20,
      mapePct: null,
      rmseKrwPerL: null,
      medianAbsoluteErrorKrwPerL: null,
      maxAbsoluteErrorKrwPerL: 20,
      directionAccuracyRatio: null,
      forecastChurnKrwPerL: null,
    },
    longOneStep: {
      windowWeeks: 26,
      sampleCount: 5,
      maeKrwPerL: 20,
      mapePct: null,
      rmseKrwPerL: null,
      medianAbsoluteErrorKrwPerL: null,
      maxAbsoluteErrorKrwPerL: 20,
      directionAccuracyRatio: null,
      forecastChurnKrwPerL: null,
    },
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [...OVER_FORECAST, point(5, 2020, 2000, { horizonIndex: 2 })],
  };
  const result = buildBiasCorrectedBacktest({
    base,
    bias: { lookbackWeeks: 4, weight: 0.5 },
    recentWindowWeeks: 13,
    longWindowWeeks: 26,
  });

  assert.equal(result.oneStepPoints.length, 5);
  assert.deepEqual(result.params.biasCorrection, { lookbackWeeks: 4, weight: 0.5 });
  assert.equal(result.recentOneStep.maeKrwPerL, 18);
  assert.equal(base.recentOneStep.maeKrwPerL, 20);
});

test("bias candidates cover the documented lookback and weight grid", () => {
  const candidates = buildBiasCandidateParams(FALLBACK_FORECAST_MODEL_PARAMS);

  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    [
      "미사용",
      "최근 4주 · 25%",
      "최근 4주 · 50%",
      "최근 8주 · 25%",
      "최근 8주 · 50%",
      "최근 13주 · 25%",
      "최근 13주 · 50%",
    ],
  );
});
