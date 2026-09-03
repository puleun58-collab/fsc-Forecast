import assert from "node:assert/strict";
import test from "node:test";

import { FALLBACK_FORECAST_MODEL_PARAMS, type ForecastModelParams } from "./forecast-model-config";
import type {
  RunWalkForwardBacktestResult,
  WalkForwardEvaluationPoint,
} from "./run-walk-forward-backtest";
import {
  ablateSignal,
  buildSignalContribution,
  readSignalContribution,
  type ForecastSignalKey,
} from "./signal-contribution";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_TARGET = Date.UTC(2026, 0, 15);

const CURRENT: ForecastModelParams = {
  ...FALLBACK_FORECAST_MODEL_PARAMS,
  modelId: "C",
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: { lagWeeks: 1, weight: 0.05 },
  biasCorrection: { lookbackWeeks: 4, weight: 0.25 },
  dailySignal: { lookbackObservations: 5, weight: 0.25 },
};

function point(
  index: number,
  forecastKrwPerL: number,
  overrides: Partial<WalkForwardEvaluationPoint> = {},
): WalkForwardEvaluationPoint {
  const targetDate = new Date(FIRST_TARGET + index * WEEK_MS);
  const actualKrwPerL = 2000;

  return {
    originWeekEndDate: new Date(targetDate.getTime() - WEEK_MS),
    targetDate,
    horizonIndex: 1,
    anchorKrwPerL: 1990,
    actualKrwPerL,
    forecastKrwPerL,
    absoluteErrorKrwPerL: Math.abs(forecastKrwPerL - actualKrwPerL),
    absolutePercentageErrorPct: (Math.abs(forecastKrwPerL - actualKrwPerL) / actualKrwPerL) * 100,
    actualDirection: "up",
    forecastDirection: "up",
    trendDeltaKrwPerL: 3,
    dubaiContributionRatio: 0.01,
    usdKrwContributionRatio: 0.002,
    rawExternalAdjustmentRatio: 0.012,
    externalAdjustmentRatio: 0.012,
    externalAdjustmentCapReached: false,
    ...overrides,
  };
}

function backtest(
  params: ForecastModelParams,
  points: readonly WalkForwardEvaluationPoint[],
): RunWalkForwardBacktestResult {
  const window = (windowWeeks: number) => ({
    windowWeeks,
    sampleCount: points.length,
    maeKrwPerL: 10,
    mapePct: 0.5,
    rmseKrwPerL: 12,
    medianAbsoluteErrorKrwPerL: 9,
    maxAbsoluteErrorKrwPerL: 20,
    directionAccuracyRatio: 0.7,
    forecastChurnKrwPerL: 4,
  });

  return {
    evaluationPoints: [],
    params,
    recent: window(13),
    long: window(26),
    recentOneStep: window(13),
    longOneStep: window(26),
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [...points],
  };
}

const BASELINE_POINTS = Array.from({ length: 13 }, (_, index) => point(index, 1995));
/** 사후 보정이 섞이지 않도록 수치 검증에는 지표 신호만 켜둔 설정을 쓴다. */
const INDICATOR_ONLY: ForecastModelParams = {
  ...CURRENT,
  biasCorrection: null,
  dailySignal: null,
};

function build(
  overrides: {
    currentParams?: ForecastModelParams;
    ablatedForecastBySignal?: Partial<Record<ForecastSignalKey, number>>;
    baselinePoints?: readonly WalkForwardEvaluationPoint[];
  } = {},
) {
  const currentParams = overrides.currentParams ?? CURRENT;
  const baselinePoints = overrides.baselinePoints ?? BASELINE_POINTS;

  return buildSignalContribution({
    currentParams,
    currentBacktest: backtest(currentParams, baselinePoints),
    dailyPrices: [],
    evaluatedAt: new Date("2026-04-01T00:00:00.000Z"),
    evaluate: (params) => {
      // 어떤 신호가 빠졌는지에 따라 제거 모델의 예측만 다르게 만든다.
      const signal: ForecastSignalKey | null =
        params.dubai === null ? "dubai" : params.usdKrw === null ? "usdKrw" : null;
      const forecast = signal === null ? 1995 : (overrides.ablatedForecastBySignal?.[signal] ?? 1990);

      return backtest(
        params,
        baselinePoints.map((base, index) =>
          point(index, forecast, {
            dubaiContributionRatio: base.dubaiContributionRatio,
            usdKrwContributionRatio: base.usdKrwContributionRatio,
          }),
        ),
      );
    },
  });
}

function contributionOf(
  contribution: ReturnType<typeof build>,
  signal: ForecastSignalKey,
) {
  return contribution.signals.find((entry) => entry.signal === signal);
}

test("removing one signal never touches the other settings", () => {
  assert.deepEqual(ablateSignal(CURRENT, "usdKrw"), { ...CURRENT, usdKrw: null, modelId: "B" });
  assert.deepEqual(ablateSignal(CURRENT, "bias"), { ...CURRENT, biasCorrection: null });
  assert.deepEqual(ablateSignal(CURRENT, "dailySignal"), { ...CURRENT, dailySignal: null });
  assert.equal(ablateSignal(CURRENT, "trend"), null);
});

test("trend cannot be removed on its own and says so instead of guessing", () => {
  const trend = contributionOf(build(), "trend");

  assert.equal(trend?.status, "not-separable");
  assert.equal(trend?.recent, null);
});

test("a signal that is not part of the operating setting is never force-enabled", () => {
  const contribution = build({
    currentParams: { ...CURRENT, biasCorrection: null, dailySignal: null },
  });

  assert.equal(contributionOf(contribution, "bias")?.status, "not-used");
  assert.equal(contributionOf(contribution, "dailySignal")?.status, "not-used");
});

test("a signal that lowered the error is reported as helpful in both windows", () => {
  const dubai = contributionOf(
    build({ currentParams: INDICATOR_ONLY, ablatedForecastBySignal: { dubai: 1980 } }),
    "dubai",
  );

  assert.equal(dubai?.status, "helpful");
  assert.equal(dubai?.recent?.baselineMaeKrwPerL, 5);
  assert.equal(dubai?.recent?.ablatedMaeKrwPerL, 20);
  assert.equal(dubai?.recent?.maeContributionKrwPerL, 15);
  assert.equal(dubai?.long?.maeContributionKrwPerL, 15);
  assert.ok((dubai?.recent?.mapeContributionPctPoint ?? 0) > 0);
});

test("a signal that raised the error is reported as a possible drag", () => {
  const dubai = contributionOf(
    build({ currentParams: INDICATOR_ONLY, ablatedForecastBySignal: { dubai: 1999 } }),
    "dubai",
  );

  assert.equal(dubai?.status, "harmful");
  assert.equal(dubai?.recent?.maeContributionKrwPerL, -4);
});

test("identical forecasts read as no measurable difference", () => {
  const dubai = contributionOf(
    build({ currentParams: INDICATOR_ONLY, ablatedForecastBySignal: { dubai: 1995 } }),
    "dubai",
  );

  assert.equal(dubai?.status, "neutral");
  assert.equal(dubai?.recent?.maeContributionKrwPerL, 0);
});

test("only weeks where the signal was actually used count as samples", () => {
  const partiallyUsed = BASELINE_POINTS.map((base, index) =>
    index < 6 ? { ...base, dubaiContributionRatio: null } : base,
  );
  const dubai = contributionOf(
    build({ baselinePoints: partiallyUsed, ablatedForecastBySignal: { dubai: 1980 } }),
    "dubai",
  );

  assert.equal(dubai?.recent?.sampleCount, 7);
});

test("too few usable weeks block a verdict instead of guessing", () => {
  const dubai = contributionOf(
    build({
      baselinePoints: BASELINE_POINTS.slice(0, 2),
      ablatedForecastBySignal: { dubai: 1980 },
    }),
    "dubai",
  );

  assert.equal(dubai?.status, "insufficient-sample");
});

test("the same run always produces the same diagnosis", () => {
  assert.deepEqual(build({ ablatedForecastBySignal: { dubai: 1980 } }), build({ ablatedForecastBySignal: { dubai: 1980 } }));
});

test("stored diagnostics round-trip and legacy runs read as null", () => {
  const contribution = build({ ablatedForecastBySignal: { dubai: 1980 } });
  const stored = JSON.parse(JSON.stringify({ model: { signalContribution: contribution } })) as unknown;

  assert.deepEqual(readSignalContribution(stored), contribution);
  assert.equal(readSignalContribution({ model: {} }), null);
});
