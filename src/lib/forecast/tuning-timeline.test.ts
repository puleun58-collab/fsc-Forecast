import assert from "node:assert/strict";
import test from "node:test";

import { CANDIDATE_PERSISTENCE_VERSION, type CandidatePersistence } from "./candidate-persistence";
import { FALLBACK_FORECAST_MODEL_PARAMS, type ForecastModelParams } from "./forecast-model-config";
import type { ShadowObservation, ShadowValidationSession } from "./shadow-validation";
import { buildTuningTimeline, type TuningTimelineRunInput } from "./tuning-timeline";

const CAP_CANDIDATE: ForecastModelParams = {
  ...FALLBACK_FORECAST_MODEL_PARAMS,
  externalAdjustmentCapRatio: 0.01,
};
const TREND_CANDIDATE: ForecastModelParams = {
  ...FALLBACK_FORECAST_MODEL_PARAMS,
  trendLookbackWeeks: 6,
};

function persistence(overrides: Partial<CandidatePersistence> = {}): CandidatePersistence {
  return {
    version: CANDIDATE_PERSISTENCE_VERSION,
    status: "confirming",
    candidateFingerprint: "cap-1",
    candidateParams: CAP_CANDIDATE,
    candidateSource: "parameter-sensitivity:cap",
    confirmedCount: 1,
    requiredCount: 2,
    lastConfirmedWeekEndDate: "2026-09-03T00:00:00.000Z",
    startedAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

function observation(index: number, actual: number | null): ShadowObservation {
  return {
    originWeekEndDate: `2026-09-${String(3 + index * 7).padStart(2, "0")}T00:00:00.000Z`,
    targetDate: `2026-09-${String(10 + index * 7).padStart(2, "0")}T00:00:00.000Z`,
    issuedAt: `2026-09-${String(3 + index * 7).padStart(2, "0")}T00:00:00.000Z`,
    anchorKrwPerL: 1900,
    baselineForecastKrwPerL: 1920,
    shadowForecastKrwPerL: 1910,
    actualKrwPerL: actual,
    baselineAbsoluteErrorKrwPerL: actual === null ? null : Math.abs(1920 - actual),
    shadowAbsoluteErrorKrwPerL: actual === null ? null : Math.abs(1910 - actual),
    baselineApePct: null,
    shadowApePct: null,
    baselineDirection: "up",
    shadowDirection: "up",
    actualDirection: actual === null ? null : "up",
  };
}

function shadow(overrides: Partial<ShadowValidationSession> = {}): ShadowValidationSession {
  return {
    version: 1,
    sessionId: "session-1",
    status: "validating",
    stoppedReason: null,
    startedAt: "2026-09-10T00:00:00.000Z",
    completedAt: null,
    baselineModelVersion: "weekly-anchor-trend-v2",
    baselineParams: FALLBACK_FORECAST_MODEL_PARAMS,
    candidateParams: CAP_CANDIDATE,
    candidateFingerprint: "cap-1",
    candidateSource: "parameter-sensitivity:cap",
    requiredSampleCount: 13,
    observations: [observation(0, 1904)],
    ...overrides,
  };
}

function run(
  completedAt: string,
  metadata: Record<string, unknown>,
  id = completedAt,
): TuningTimelineRunInput {
  return { id, completedAt, metadata: { model: metadata } };
}

test("a run without tuning metadata produces no history at all", () => {
  const timeline = buildTuningTimeline({
    runs: [{ id: "legacy", completedAt: "2026-09-03T00:00:00.000Z", metadata: {} }],
  });

  assert.deepEqual(timeline, []);
});

test("the first candidate opens the history and a second week is its own event", () => {
  const timeline = buildTuningTimeline({
    runs: [
      run("2026-09-03T01:00:00.000Z", { candidatePersistence: persistence() }),
      run("2026-09-10T01:00:00.000Z", {
        candidatePersistence: persistence({
          status: "confirmed",
          confirmedCount: 2,
          lastConfirmedWeekEndDate: "2026-09-10T00:00:00.000Z",
        }),
      }),
    ],
  });

  assert.deepEqual(
    timeline.map((event) => [event.type, event.confirmedCount]),
    [
      ["candidate-confirmed", 2],
      ["candidate-started", 1],
    ],
  );
});

test("repeated runs on the same weekly data never duplicate the history", () => {
  const snapshot = persistence();
  const timeline = buildTuningTimeline({
    runs: [
      run("2026-09-03T01:00:00.000Z", { candidatePersistence: snapshot }, "run-1"),
      run("2026-09-03T02:00:00.000Z", { candidatePersistence: snapshot }, "run-2"),
      run("2026-09-03T03:00:00.000Z", { candidatePersistence: snapshot }, "run-3"),
    ],
  });

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].type, "candidate-started");
});

test("a different candidate is reported as a change with the setting it replaced", () => {
  const timeline = buildTuningTimeline({
    runs: [
      run("2026-09-03T01:00:00.000Z", { candidatePersistence: persistence() }),
      run("2026-09-10T01:00:00.000Z", {
        candidatePersistence: persistence({
          candidateFingerprint: "trend-6",
          candidateParams: TREND_CANDIDATE,
          confirmedCount: 1,
          lastConfirmedWeekEndDate: "2026-09-10T00:00:00.000Z",
        }),
      }),
    ],
  });

  assert.equal(timeline[0].type, "candidate-changed");
  assert.deepEqual(timeline[0].candidateParams, TREND_CANDIDATE);
  assert.deepEqual(timeline[0].previousCandidateParams, CAP_CANDIDATE);
});

test("losing the candidate is recorded once, not on every later run", () => {
  const cleared = persistence({
    status: "waiting",
    candidateFingerprint: null,
    candidateParams: null,
    confirmedCount: 0,
    lastConfirmedWeekEndDate: null,
  });
  const timeline = buildTuningTimeline({
    runs: [
      run("2026-09-03T01:00:00.000Z", { candidatePersistence: persistence() }),
      run("2026-09-10T01:00:00.000Z", { candidatePersistence: cleared }),
      run("2026-09-17T01:00:00.000Z", { candidatePersistence: cleared }),
    ],
  });

  assert.deepEqual(
    timeline.map((event) => event.type),
    ["candidate-cleared", "candidate-started"],
  );
});

test("shadow entry, weekly progress and completion each appear once", () => {
  const timeline = buildTuningTimeline({
    runs: [
      run("2026-09-10T01:00:00.000Z", { shadowValidation: shadow() }),
      run("2026-09-11T01:00:00.000Z", { shadowValidation: shadow() }),
      run("2026-09-17T01:00:00.000Z", {
        shadowValidation: shadow({ observations: [observation(0, 1904), observation(1, 1908)] }),
      }),
      run("2026-09-24T01:00:00.000Z", {
        shadowValidation: shadow({
          status: "reviewable",
          completedAt: "2026-09-24T00:00:00.000Z",
          observations: Array.from({ length: 13 }, (_, index) => observation(index, 1904 + index)),
        }),
      }),
    ],
  });

  assert.deepEqual(
    timeline.map((event) => [event.type, event.shadowSampleCount]),
    [
      ["shadow-completed", 13],
      ["shadow-progress", 2],
      ["shadow-started", 1],
    ],
  );
  assert.ok((timeline[0].shadowMaeKrwPerL ?? 0) > 0);
});

test("a stopped shadow session is reported instead of a silent restart", () => {
  const timeline = buildTuningTimeline({
    runs: [
      run("2026-09-10T01:00:00.000Z", { shadowValidation: shadow() }),
      run("2026-09-17T01:00:00.000Z", {
        shadowValidation: shadow({ status: "stopped", stoppedReason: "baseline_params_changed" }),
      }),
    ],
  });

  assert.deepEqual(
    timeline.map((event) => event.type),
    ["shadow-stopped", "shadow-started"],
  );
});

test("approval, application and rollback continue the same timeline", () => {
  const timeline = buildTuningTimeline({
    runs: [],
    transitions: [
      {
        approvedAt: "2026-10-01T00:00:00.000Z",
        appliedAt: "2026-10-02T00:00:00.000Z",
        status: "applied",
        sourceKind: "shadow_admin_approved",
        candidateParams: CAP_CANDIDATE,
      },
      {
        approvedAt: "2026-11-01T00:00:00.000Z",
        appliedAt: "2026-11-02T00:00:00.000Z",
        status: "applied",
        sourceKind: "post_transition_rollback",
        candidateParams: FALLBACK_FORECAST_MODEL_PARAMS,
      },
      {
        approvedAt: "2026-11-10T00:00:00.000Z",
        appliedAt: null,
        status: "cancelled",
        sourceKind: "shadow_admin_approved",
        candidateParams: TREND_CANDIDATE,
      },
    ],
  });

  assert.deepEqual(
    timeline.map((event) => event.type),
    [
      "transition-cancelled",
      "transition-rolled-back",
      "transition-approved",
      "transition-applied",
      "transition-approved",
    ],
  );
});

test("only the most recent events are kept", () => {
  const runs = Array.from({ length: 25 }, (_, index) =>
    run(
      `2026-09-${String(index + 1).padStart(2, "0")}T01:00:00.000Z`,
      {
        candidatePersistence: persistence({
          confirmedCount: index + 1,
          lastConfirmedWeekEndDate: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      },
      `run-${index}`,
    ),
  );
  const timeline = buildTuningTimeline({ runs, limit: 20 });

  assert.equal(timeline.length, 20);
  assert.equal(timeline[0].confirmedCount, 25);
});
