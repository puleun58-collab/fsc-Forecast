import assert from "node:assert/strict";
import test from "node:test";

import { FALLBACK_FORECAST_MODEL_PARAMS } from "./forecast-model-config";
import { evaluateShadowDegradation } from "./shadow-degradation";
import { SHADOW_REQUIRED_SAMPLE_COUNT, type ShadowValidationSession } from "./shadow-validation";

function session(errors: readonly { baseline: number; shadow: number }[]): ShadowValidationSession {
  return {
    version: 1,
    sessionId: "session",
    status: "validating",
    stoppedReason: null,
    startedAt: "2026-06-01T00:00:00.000Z",
    completedAt: null,
    baselineModelVersion: "v1",
    baselineParams: FALLBACK_FORECAST_MODEL_PARAMS,
    candidateParams: { ...FALLBACK_FORECAST_MODEL_PARAMS, trendLookbackWeeks: 6 },
    candidateFingerprint: "fingerprint",
    candidateSource: "parameter-sensitivity:trendLookback",
    requiredSampleCount: SHADOW_REQUIRED_SAMPLE_COUNT,
    observations: errors.map((entry, index) => ({
      originWeekEndDate: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      targetDate: `2026-06-${String(index + 8).padStart(2, "0")}T00:00:00.000Z`,
      issuedAt: "2026-06-01T00:00:00.000Z",
      anchorKrwPerL: 1500,
      baselineForecastKrwPerL: 1500 + entry.baseline,
      shadowForecastKrwPerL: 1500 + entry.shadow,
      actualKrwPerL: 1500,
      baselineAbsoluteErrorKrwPerL: entry.baseline,
      shadowAbsoluteErrorKrwPerL: entry.shadow,
      baselineApePct: null,
      shadowApePct: null,
      baselineDirection: "up" as const,
      shadowDirection: "up" as const,
      actualDirection: "up" as const,
    })),
  };
}

test("fewer than four confirmed weeks never trigger a performance verdict", () => {
  const degradation = evaluateShadowDegradation(
    session([
      { baseline: 20, shadow: 40 },
      { baseline: 20, shadow: 40 },
      { baseline: 20, shadow: 40 },
    ]),
  );

  assert.equal(degradation?.status, "insufficient-samples");
  assert.equal(degradation?.sampleCount, 3);
  assert.equal(degradation?.confirmedCount, 0);
});

test("a shadow that tracks the operating model stays stable", () => {
  const degradation = evaluateShadowDegradation(
    session(Array.from({ length: 6 }, () => ({ baseline: 20, shadow: 21 }))),
  );

  assert.equal(degradation?.status, "stable");
  assert.equal(degradation?.shadowCumulativeMaeKrwPerL, 21);
  assert.equal(degradation?.baselineCumulativeMaeKrwPerL, 20);
  assert.equal(degradation?.confirmedCount, 0);
});

test("both gaps must clear the threshold before the first degradation is recorded", () => {
  const degradation = evaluateShadowDegradation(
    session(Array.from({ length: 4 }, () => ({ baseline: 20, shadow: 25 }))),
  );

  assert.equal(degradation?.status, "watch");
  assert.equal(degradation?.confirmedCount, 1);
  assert.equal(degradation?.relativeGapRatio, 0.25);
  assert.equal(degradation?.absoluteGapKrwPerL, 5);
});

test("a wide relative gap without the absolute gap is not a degradation", () => {
  const degradation = evaluateShadowDegradation(
    session(Array.from({ length: 5 }, () => ({ baseline: 4, shadow: 8 }))),
  );

  assert.equal(degradation?.status, "stable");
  assert.equal(degradation?.confirmedCount, 0);
});

test("two consecutive degraded weeks meet the stop condition", () => {
  const degradation = evaluateShadowDegradation(
    session(Array.from({ length: 5 }, () => ({ baseline: 20, shadow: 26 }))),
  );

  assert.equal(degradation?.status, "stop-recommended");
  assert.equal(degradation?.confirmedCount, 2);
});

test("recovering back to the operating level resets the degradation count", () => {
  const degradation = evaluateShadowDegradation(
    session([
      { baseline: 20, shadow: 30 },
      { baseline: 20, shadow: 30 },
      { baseline: 20, shadow: 30 },
      { baseline: 20, shadow: 30 },
      { baseline: 20, shadow: 4 },
      { baseline: 20, shadow: 4 },
      { baseline: 20, shadow: 4 },
    ]),
  );

  assert.equal(degradation?.status, "stable");
  assert.equal(degradation?.confirmedCount, 0);
});

test("runs without a shadow session report nothing", () => {
  assert.equal(evaluateShadowDegradation(null), null);
});
