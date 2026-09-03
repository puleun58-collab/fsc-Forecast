import assert from "node:assert/strict";
import test from "node:test";

import { describeTuningCandidateDecision } from "./candidate-decision";
import type { PromotionQualityChecks } from "./promotion-quality";

function checks(overrides: Partial<PromotionQualityChecks> = {}): PromotionQualityChecks {
  return {
    maeImprovementRatio: 0.395,
    mapeImprovementPctPoint: 0.68,
    meetsMinimumImprovement: true,
    longStable: true,
    maxErrorStable: true,
    churnStable: true,
    ...overrides,
  };
}

test("the ranked first candidate that passed everything is the top choice", () => {
  const decision = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks(),
    sampleCount: 13,
    rank: 1,
  });

  assert.deepEqual(decision, {
    status: "top",
    reasons: [],
    rank: 1,
    improvementBasis: "mae",
  });
});

test("a passing candidate ranked below first stays eligible with its rank", () => {
  const decision = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks(),
    sampleCount: 13,
    rank: 2,
  });

  assert.equal(decision.status, "eligible");
  assert.equal(decision.rank, 2);
});

test("a passing candidate outside the kept list is still eligible without a rank", () => {
  const decision = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks(),
    sampleCount: 13,
    rank: null,
  });

  assert.equal(decision.status, "eligible");
  assert.equal(decision.rank, null);
});

test("each failed guardrail becomes its own rejection reason", () => {
  const cases: [Partial<PromotionQualityChecks>, string][] = [
    [{ meetsMinimumImprovement: false, maeImprovementRatio: 0.01, mapeImprovementPctPoint: 0.02 }, "minimum-improvement"],
    [{ longStable: false }, "long-mae"],
    [{ maxErrorStable: false }, "max-error"],
    [{ churnStable: false }, "churn"],
  ];

  for (const [overrides, reason] of cases) {
    const decision = describeTuningCandidateDecision({
      isCurrent: false,
      qualityChecks: checks(overrides),
      sampleCount: 13,
      rank: null,
    });

    assert.equal(decision.status, "rejected");
    assert.deepEqual(decision.reasons, [reason]);
  }
});

test("several failed guardrails are all reported, none hidden", () => {
  const decision = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks({ longStable: false, maxErrorStable: false }),
    sampleCount: 13,
    rank: null,
  });

  assert.deepEqual(decision.reasons, ["long-mae", "max-error"]);
});

test("too few next-week samples read as not evaluable, never as a rejected candidate", () => {
  const decision = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks(),
    sampleCount: 6,
    rank: null,
  });

  assert.equal(decision.status, "not-evaluable");
  assert.deepEqual(decision.reasons, ["insufficient-sample"]);
});

test("the current setting is never judged as a candidate", () => {
  const decision = describeTuningCandidateDecision({
    isCurrent: true,
    qualityChecks: null,
    sampleCount: 13,
    rank: null,
  });

  assert.deepEqual(decision, { status: "current", reasons: [], rank: null, improvementBasis: null });
});

test("the improvement basis names the metric that cleared the minimum", () => {
  const byMape = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks({ maeImprovementRatio: 0.01, mapeImprovementPctPoint: 0.68 }),
    sampleCount: 13,
    rank: 1,
  });
  const neither = describeTuningCandidateDecision({
    isCurrent: false,
    qualityChecks: checks({
      meetsMinimumImprovement: false,
      maeImprovementRatio: 0.01,
      mapeImprovementPctPoint: 0.02,
    }),
    sampleCount: 13,
    rank: null,
  });

  assert.equal(byMape.improvementBasis, "mape");
  assert.equal(neither.improvementBasis, null);
});
