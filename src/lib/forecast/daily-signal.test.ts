import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDailySignal,
  buildDailySignalBacktest,
  buildDailySignalCandidateParams,
  calculateDailyTrendRatio,
  selectRecentDailyObservations,
  summarizeDailySignalState,
} from "./daily-signal";
import { FALLBACK_FORECAST_MODEL_PARAMS } from "./forecast-model-config";
import type { RunWalkForwardBacktestResult, WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";
import type { ForecastDailyPriceRow } from "./types";

function daily(date: string, price: number): ForecastDailyPriceRow {
  return {
    priceDate: new Date(`${date}T00:00:00.000Z`),
    observedPriceKrwPerL: price,
    currentRevisionId: `${date}-revision`,
  };
}

const RISING: ForecastDailyPriceRow[] = [
  daily("2026-06-01", 1950),
  daily("2026-06-02", 1956),
  daily("2026-06-03", 1962),
  daily("2026-06-04", 1969),
  daily("2026-06-05", 1976),
];

function point(overrides: Partial<WalkForwardEvaluationPoint> = {}): WalkForwardEvaluationPoint {
  return {
    originWeekEndDate: new Date("2026-06-05T00:00:00.000Z"),
    targetDate: new Date("2026-06-12T00:00:00.000Z"),
    horizonIndex: 1,
    anchorKrwPerL: 1976,
    actualKrwPerL: 2010,
    forecastKrwPerL: 2000,
    absoluteErrorKrwPerL: 10,
    absolutePercentageErrorPct: (10 / 2010) * 100,
    actualDirection: "up",
    forecastDirection: "up",
    trendDeltaKrwPerL: 4,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
    ...overrides,
  };
}

test("the five most recent valid observations are used even when calendar days are missing", () => {
  const withGaps = [
    daily("2026-05-25", 1900),
    daily("2026-05-29", 1950),
    daily("2026-06-01", 1956),
    daily("2026-06-02", 1962),
    daily("2026-06-04", 1969),
    daily("2026-06-05", 1976),
  ];
  const observations = selectRecentDailyObservations(withGaps, new Date("2026-06-05T00:00:00.000Z"));

  assert.deepEqual(
    observations.map((observation) => observation.priceKrwPerL),
    [1950, 1956, 1962, 1969, 1976],
  );
});

test("invalid, duplicated, and future rows never enter the observation window", () => {
  const messy = [
    daily("2026-06-01", Number.NaN),
    daily("2026-06-01", 1950),
    daily("2026-06-02", 0),
    daily("2026-06-02", 1956),
    daily("2026-06-03", -10),
    daily("2026-06-03", 1962),
    daily("2026-06-04", 1969),
    daily("2026-06-05", 1976),
    daily("2026-06-08", 2100),
  ];
  const observations = selectRecentDailyObservations(messy, new Date("2026-06-05T00:00:00.000Z"));

  assert.deepEqual(
    observations.map((observation) => observation.priceKrwPerL),
    [1950, 1956, 1962, 1969, 1976],
  );
});

test("the trend ratio compares the newest observation against the oldest one", () => {
  const rising = calculateDailyTrendRatio(
    selectRecentDailyObservations(RISING, new Date("2026-06-05T00:00:00.000Z")),
  );
  const falling = calculateDailyTrendRatio(
    selectRecentDailyObservations(
      [
        daily("2026-06-01", 2000),
        daily("2026-06-02", 1990),
        daily("2026-06-03", 1985),
        daily("2026-06-04", 1975),
        daily("2026-06-05", 1960),
      ],
      new Date("2026-06-05T00:00:00.000Z"),
    ),
  );

  assert.equal(rising?.toFixed(4), (1976 / 1950 - 1).toFixed(4));
  assert.ok(falling !== null && falling < 0);
});

test("fewer than five valid observations produce no signal at all", () => {
  const state = summarizeDailySignalState(RISING.slice(0, 3), new Date("2026-06-05T00:00:00.000Z"));

  assert.equal(state.sufficient, false);
  assert.equal(state.observationCount, 3);
  assert.equal(state.trendRatio, null);
  assert.deepEqual(selectRecentDailyObservations(RISING.slice(0, 3), new Date("2026-06-05T00:00:00.000Z")), []);
});

test("each weight reverts only its share of the short-term move", () => {
  const trendRatio = 1976 / 1950 - 1;
  const quarter = applyDailySignal([point()], RISING, { lookbackObservations: 5, weight: 0.25 });
  const half = applyDailySignal([point()], RISING, { lookbackObservations: 5, weight: 0.5 });

  assert.equal(quarter[0].forecastKrwPerL.toFixed(4), (2000 * (1 + trendRatio * 0.25)).toFixed(4));
  assert.equal(half[0].forecastKrwPerL.toFixed(4), (2000 * (1 + trendRatio * 0.5)).toFixed(4));
  assert.equal(quarter[0].absoluteErrorKrwPerL.toFixed(4), Math.abs(quarter[0].forecastKrwPerL - 2010).toFixed(4));
});

test("a past origin only sees daily prices confirmed before its own week end", () => {
  const laterSpike = [...RISING, daily("2026-06-12", 2400), daily("2026-06-19", 2600)];
  const corrected = applyDailySignal([point()], laterSpike, { lookbackObservations: 5, weight: 0.5 });
  const withoutLaterRows = applyDailySignal([point()], RISING, { lookbackObservations: 5, weight: 0.5 });

  assert.equal(corrected[0].forecastKrwPerL, withoutLaterRows[0].forecastKrwPerL);
});

test("an origin without five prior observations keeps the base forecast untouched", () => {
  const early = point({
    originWeekEndDate: new Date("2026-06-02T00:00:00.000Z"),
    targetDate: new Date("2026-06-09T00:00:00.000Z"),
  });
  const corrected = applyDailySignal([early], RISING, { lookbackObservations: 5, weight: 0.5 });

  assert.equal(corrected[0].forecastKrwPerL, early.forecastKrwPerL);
});

test("the candidate backtest is rebuilt from the corrected next-week points only", () => {
  const base: RunWalkForwardBacktestResult = {
    evaluationPoints: [],
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    recent: null as never,
    long: null as never,
    recentOneStep: {
      windowWeeks: 13,
      sampleCount: 1,
      maeKrwPerL: 10,
      mapePct: null,
      rmseKrwPerL: null,
      medianAbsoluteErrorKrwPerL: null,
      maxAbsoluteErrorKrwPerL: 10,
      directionAccuracyRatio: null,
      forecastChurnKrwPerL: null,
    },
    longOneStep: {
      windowWeeks: 26,
      sampleCount: 1,
      maeKrwPerL: 10,
      mapePct: null,
      rmseKrwPerL: null,
      medianAbsoluteErrorKrwPerL: null,
      maxAbsoluteErrorKrwPerL: 10,
      directionAccuracyRatio: null,
      forecastChurnKrwPerL: null,
    },
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [point(), point({ horizonIndex: 2 })],
  };
  const result = buildDailySignalBacktest({
    base,
    dailyPrices: RISING,
    signal: { lookbackObservations: 5, weight: 0.5 },
    recentWindowWeeks: 13,
    longWindowWeeks: 26,
  });

  assert.equal(result.oneStepPoints.length, 1);
  assert.deepEqual(result.params.dailySignal, { lookbackObservations: 5, weight: 0.5 });
  assert.ok((result.recentOneStep.maeKrwPerL ?? 0) < 10);
  assert.deepEqual(base.params.dailySignal, null);
});

test("only the two documented weights are offered next to the current setting", () => {
  const candidates = buildDailySignalCandidateParams(FALLBACK_FORECAST_MODEL_PARAMS);

  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    ["미사용", "최근 5개 · 25%", "최근 5개 · 50%"],
  );
  assert.deepEqual(candidates[1].params.dailySignal, { lookbackObservations: 5, weight: 0.25 });
});
