import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePromotionQuality, evaluateTuningCandidateQuality } from "./promotion-quality";
import type { RunWalkForwardBacktestResult } from "./run-walk-forward-backtest";

function window(maeKrwPerL: number, overrides: Record<string, number> = {}) {
  return {
    windowWeeks: 13,
    sampleCount: 13,
    maeKrwPerL,
    mapePct: maeKrwPerL / 18,
    rmseKrwPerL: maeKrwPerL + 2,
    medianAbsoluteErrorKrwPerL: maeKrwPerL - 1,
    maxAbsoluteErrorKrwPerL: maeKrwPerL * 2,
    directionAccuracyRatio: 0.62,
    forecastChurnKrwPerL: 5,
    ...overrides,
  };
}

function backtest(full: number, oneStep: number): RunWalkForwardBacktestResult {
  return {
    params: {
      modelId: "B",
      trendLookbackWeeks: 8,
      dubai: { lagWeeks: 1, weight: 0.2 },
      usdKrw: null,
      externalAdjustmentCapRatio: 0.03,
    },
    recent: window(full),
    long: window(full + 1.7, { windowWeeks: 26 }),
    recentOneStep: window(oneStep),
    longOneStep: window(oneStep + 1.7, { windowWeeks: 26 }),
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [],
  };
}

test("model promotion keeps reading the full-horizon windows", () => {
  const current = backtest(22.8, 22.8);
  // 전체 예측만 개선되고 다음 주 예측은 악화된 후보.
  const candidate = backtest(18.4, 26);

  assert.equal(evaluatePromotionQuality(current, candidate).meetsMinimumImprovement, true);
  assert.equal(evaluateTuningCandidateQuality(current, candidate).meetsMinimumImprovement, false);
});

test("tuning candidates read the next-week windows", () => {
  const current = backtest(22.8, 22.8);
  // 다음 주 예측만 개선된 후보.
  const candidate = backtest(26, 18.4);

  assert.equal(evaluatePromotionQuality(current, candidate).meetsMinimumImprovement, false);
  assert.equal(evaluateTuningCandidateQuality(current, candidate).meetsMinimumImprovement, true);
  assert.equal(evaluateTuningCandidateQuality(current, candidate).longStable, true);
});
