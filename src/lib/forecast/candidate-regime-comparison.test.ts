import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCandidateRegimeComparisons,
  readCandidateRegimeComparisons,
  type CandidateRegimeInput,
} from "./candidate-regime-comparison";
import type { ForecastModelParams } from "./forecast-model-config";
import { buildMarketRegimeTimeline, type MarketRegime } from "./market-regime";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";
import type { ForecastSeriesPoint } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_WEEK_END = Date.UTC(2026, 0, 3);
const EVALUATED_AT = new Date("2026-09-03T00:00:00.000Z");
const MODEL_VERSION = "test-v1";

const CURRENT_PARAMS: ForecastModelParams = {
  modelId: "B",
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const CALM_WAVE = [0, 3, -2, 4, -3, 2, -1, 3];
const PRICES = [
  ...Array.from({ length: 24 }, (_, index) => 1500 + index + CALM_WAVE[index % CALM_WAVE.length]),
  1540,
  1552,
  1564,
  1576,
  1600,
  1480,
  1620,
  1620,
];

function weekEnd(index: number): Date {
  return new Date(FIRST_WEEK_END + index * WEEK_MS);
}

const WEEKLY_SERIES: ForecastSeriesPoint[] = PRICES.map((price, index) => ({
  horizonKind: "weekly",
  periodStart: new Date(weekEnd(index).getTime() - 6 * 24 * 60 * 60 * 1000),
  periodEnd: weekEnd(index),
  targetDate: weekEnd(index),
  pointKrwPerL: price,
  sampleCount: 5,
}));

const TIMELINE = buildMarketRegimeTimeline(WEEKLY_SERIES);

function originsOf(regime: MarketRegime): number[] {
  return TIMELINE.flatMap((entry, index) => (entry.regime === regime ? [index] : []));
}

function point(
  originIndex: number,
  forecastKrwPerL: number,
  overrides: Partial<WalkForwardEvaluationPoint> = {},
): WalkForwardEvaluationPoint {
  const actualKrwPerL = 1500;
  const absoluteErrorKrwPerL = Math.abs(forecastKrwPerL - actualKrwPerL);

  return {
    originWeekEndDate: weekEnd(originIndex),
    targetDate: weekEnd(originIndex + 1),
    horizonIndex: 1,
    anchorKrwPerL: 1490,
    actualKrwPerL,
    forecastKrwPerL,
    absoluteErrorKrwPerL,
    absolutePercentageErrorPct: (absoluteErrorKrwPerL / actualKrwPerL) * 100,
    actualDirection: "up",
    forecastDirection: "up",
    trendDeltaKrwPerL: 2,
    dubaiContributionRatio: 0.01,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0.01,
    externalAdjustmentRatio: 0.01,
    externalAdjustmentCapReached: false,
    ...overrides,
  };
}

const STABLE_ORIGINS = originsOf("stable").slice(-4);
const VOLATILE_ORIGINS = originsOf("high-volatility").slice(-2);

function candidate(
  overrides: Partial<CandidateRegimeInput> & { oneStepPoints: WalkForwardEvaluationPoint[] },
): CandidateRegimeInput {
  return {
    label: "[단일 설정] Trend lookback 6주",
    kind: "single",
    params: { ...CURRENT_PARAMS, trendLookbackWeeks: 6 },
    ...overrides,
  };
}

function compare(candidates: readonly CandidateRegimeInput[], currentPoints = currentOneStepPoints()) {
  return buildCandidateRegimeComparisons({
    weeklySeries: WEEKLY_SERIES,
    currentOneStepPoints: currentPoints,
    candidates,
    modelVersion: MODEL_VERSION,
    evaluatedAt: EVALUATED_AT,
  });
}

function currentOneStepPoints(): WalkForwardEvaluationPoint[] {
  return [
    ...STABLE_ORIGINS.map((origin) => point(origin, 1520)),
    ...VOLATILE_ORIGINS.map((origin) => point(origin, 1530)),
  ];
}

test("a candidate is compared on the shared regime timeline and the same weeks", () => {
  const [comparison] = compare([
    candidate({
      oneStepPoints: [
        ...STABLE_ORIGINS.map((origin) => point(origin, 1510)),
        ...VOLATILE_ORIGINS.map((origin) => point(origin, 1580)),
        // 현재 설정에 없는 주차는 비교에서 제외된다.
        point(STABLE_ORIGINS[0] + 100, 1400),
      ],
    }),
  ]);
  const stable = comparison.regimes.find((row) => row.regime === "stable");
  const volatile = comparison.regimes.find((row) => row.regime === "high-volatility");

  assert.deepEqual(
    comparison.regimes.map((row) => row.regime),
    ["stable", "rising", "falling", "high-volatility"],
  );
  assert.equal(comparison.comparedSampleCount, STABLE_ORIGINS.length + VOLATILE_ORIGINS.length);
  assert.equal(stable?.sampleCount, STABLE_ORIGINS.length);
  assert.equal(stable?.currentMaeKrwPerL, 20);
  assert.equal(stable?.candidateMaeKrwPerL, 10);
  assert.equal(stable?.maeDeltaKrwPerL, -10);
  assert.equal(stable?.verdict, "improved");
  assert.equal(volatile?.sampleCount, VOLATILE_ORIGINS.length);
  assert.equal(volatile?.verdict, "insufficient-sample");
});

test("the regime split matches the shared market regime timeline", () => {
  const [comparison] = compare([
    candidate({ oneStepPoints: STABLE_ORIGINS.map((origin) => point(origin, 1510)) }),
  ]);

  for (const row of comparison.regimes) {
    const expected = STABLE_ORIGINS.filter(
      (origin) => TIMELINE[origin].regime === row.regime,
    ).length;

    assert.equal(row.sampleCount, expected);
  }
});

test("later weeks never change an earlier comparison", () => {
  const points = STABLE_ORIGINS.map((origin) => point(origin, 1510));
  const baseline = compare([candidate({ oneStepPoints: points })]);
  const extended = buildCandidateRegimeComparisons({
    weeklySeries: [
      ...WEEKLY_SERIES,
      {
        horizonKind: "weekly",
        periodStart: weekEnd(WEEKLY_SERIES.length),
        periodEnd: weekEnd(WEEKLY_SERIES.length),
        targetDate: weekEnd(WEEKLY_SERIES.length),
        pointKrwPerL: 9000,
        sampleCount: 5,
      },
    ],
    currentOneStepPoints: currentOneStepPoints(),
    candidates: [candidate({ oneStepPoints: points })],
    modelVersion: MODEL_VERSION,
    evaluatedAt: EVALUATED_AT,
  });

  assert.deepEqual(
    extended[0].regimes.map((row) => [row.regime, row.sampleCount, row.verdict]),
    baseline[0].regimes.map((row) => [row.regime, row.sampleCount, row.verdict]),
  );
});

test("differences below the display precision read as similar", () => {
  const [comparison] = compare([
    candidate({
      oneStepPoints: STABLE_ORIGINS.map((origin, index) =>
        point(origin, index === 0 ? 1520.001 : 1520),
      ),
    }),
  ]);
  const stable = comparison.regimes.find((row) => row.regime === "stable");

  assert.equal(stable?.verdict, "similar");
});

test("a worsened regime is reported as the weakest one", () => {
  const stableOrigins = originsOf("stable").slice(-3);
  const risingOrigins = originsOf("rising").slice(-3);
  const currentPoints = [
    ...stableOrigins.map((origin) => point(origin, 1520)),
    ...risingOrigins.map((origin) => point(origin, 1520)),
  ];
  const [comparison] = compare(
    [
      candidate({
        oneStepPoints: [
          ...stableOrigins.map((origin) => point(origin, 1515)),
          ...risingOrigins.map((origin) => point(origin, 1560)),
        ],
      }),
    ],
    currentPoints,
  );

  assert.equal(comparison.regimes.find((row) => row.regime === "stable")?.verdict, "improved");
  assert.equal(comparison.regimes.find((row) => row.regime === "rising")?.verdict, "worsened");
  assert.equal(comparison.weakestRegime, "rising");
});

test("single and combination candidates are compared the same way, up to three", () => {
  const points = STABLE_ORIGINS.map((origin) => point(origin, 1510));
  const comparisons = compare([
    candidate({ oneStepPoints: points }),
    candidate({
      label: "[조합] Trend lookback 6주 + 외부 보정 Cap ±2%",
      kind: "combination",
      params: { ...CURRENT_PARAMS, trendLookbackWeeks: 6, externalAdjustmentCapRatio: 0.02 },
      oneStepPoints: points,
    }),
    candidate({
      label: "[단일 설정] Dubai lag 2주 · weight 15.0%",
      params: { ...CURRENT_PARAMS, dubai: { lagWeeks: 2, weight: 0.15 } },
      oneStepPoints: points,
    }),
  ]);

  assert.equal(comparisons.length, 3);
  assert.deepEqual(
    comparisons.map((comparison) => comparison.kind),
    ["single", "combination", "single"],
  );
  assert.equal(new Set(comparisons.map((comparison) => comparison.paramsKey)).size, 3);
  assert.equal(new Set(comparisons.map((comparison) => comparison.candidateFingerprint)).size, 3);
});

test("no candidates produce no comparisons and old runs read as null", () => {
  const comparisons = compare([]);
  const stored = JSON.parse(
    JSON.stringify({
      model: {
        candidateRegimeComparisons: compare([
          candidate({ oneStepPoints: STABLE_ORIGINS.map((origin) => point(origin, 1510)) }),
        ]),
      },
    }),
  );

  assert.deepEqual(comparisons, []);
  assert.equal(readCandidateRegimeComparisons(stored)?.length, 1);
  assert.equal(readCandidateRegimeComparisons({ model: { parameterSensitivity: {} } }), null);
  assert.equal(readCandidateRegimeComparisons(null), null);
});
