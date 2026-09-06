import assert from "node:assert/strict";
import test from "node:test";

import { resolveTrackedCandidate, selectRawTopCandidate } from "./candidate-switch";
import { FALLBACK_FORECAST_MODEL_PARAMS, type ForecastModelParams } from "./forecast-model-config";
import { buildCandidateFingerprint, type ShadowCandidateInput } from "./shadow-validation";

const MODEL_VERSION = "test-v1";
const BASELINE: ForecastModelParams = { ...FALLBACK_FORECAST_MODEL_PARAMS, trendLookbackWeeks: 8 };

function candidate(
  trendLookbackWeeks: number,
  recentOneStepMaeKrwPerL: number | null,
  meetsPromotionQuality = true,
): ShadowCandidateInput {
  return {
    params: { ...BASELINE, trendLookbackWeeks },
    meetsPromotionQuality,
    source: `parameter-sensitivity:trendLookback:${trendLookbackWeeks}`,
    recentOneStepMaeKrwPerL,
  };
}

function fingerprintOf(trendLookbackWeeks: number): string {
  return buildCandidateFingerprint({ ...BASELINE, trendLookbackWeeks }, MODEL_VERSION);
}

test("the first tracked candidate is the raw top candidate", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: null,
    candidates: [candidate(6, 14.21), candidate(10, 15.99)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "no-tracked-candidate");
  assert.equal(decision.candidate?.params.trendLookbackWeeks, 6);
});

test("a marginal improvement never replaces the candidate being confirmed", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, 14.21), candidate(10, 14.27)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "tracked-candidate-kept");
  assert.equal(decision.candidate?.params.trendLookbackWeeks, 10);
  assert.ok((decision.maeImprovementRatio ?? 0) < 0.05);
  assert.ok((decision.maeImprovementKrwPerL ?? 0) < 0.5);
});

test("a meaningful improvement replaces the candidate and reports both gaps", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, 14.21), candidate(10, 15.99)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "significant-improvement");
  assert.equal(decision.candidate?.params.trendLookbackWeeks, 6);
  assert.ok((decision.maeImprovementRatio ?? 0) > 0.11);
  assert.ok((decision.maeImprovementKrwPerL ?? 0) > 1.7);
});

test("an improvement that clears only one of the two gates keeps the candidate", () => {
  const relativeOnly = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, 4.6), candidate(10, 5.0)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });
  const absoluteOnly = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, 39.4), candidate(10, 40.0)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(relativeOnly.candidate?.params.trendLookbackWeeks, 10);
  assert.equal(absoluteOnly.candidate?.params.trendLookbackWeeks, 10);
});

test("a tracked candidate that fails the quality bar is replaced immediately", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, 14.27), candidate(10, 14.21, false)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "tracked-candidate-unqualified");
  assert.equal(decision.candidate?.params.trendLookbackWeeks, 6);
});

test("a tracked candidate that disappeared is replaced by the raw top candidate", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(12),
    candidates: [candidate(6, 14.21)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "tracked-candidate-unqualified");
  assert.equal(decision.candidate?.params.trendLookbackWeeks, 6);
});

test("the raw top candidate skips unqualified rows and the operating setting", () => {
  const top = selectRawTopCandidate(
    [candidate(8, 12.0), candidate(6, 13.0, false), candidate(10, 14.0)],
    BASELINE,
    MODEL_VERSION,
  );

  assert.equal(top?.params.trendLookbackWeeks, 10);
});

test("no qualified candidate reports an empty decision", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, 14.21, false)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "no-candidate");
  assert.equal(decision.candidate, null);
});

test("missing candidate performance keeps the tracked candidate", () => {
  const decision = resolveTrackedCandidate({
    trackedFingerprint: fingerprintOf(10),
    candidates: [candidate(6, null), candidate(10, null)],
    baselineParams: BASELINE,
    modelVersion: MODEL_VERSION,
  });

  assert.equal(decision.reason, "tracked-candidate-kept");
  assert.equal(decision.candidate?.params.trendLookbackWeeks, 10);
});
