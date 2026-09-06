import assert from "node:assert/strict";
import test from "node:test";

import { CANDIDATE_PERSISTENCE_VERSION, type CandidatePersistence } from "./candidate-persistence";
import { FALLBACK_FORECAST_MODEL_PARAMS } from "./forecast-model-config";
import type { ForecastInputQuality } from "./input-quality";
import type { IntervalForwardValidation } from "./interval-forward-validation";
import {
  buildOperationsStatusCenter,
  type BuildOperationsStatusCenterInput,
} from "./operations-status";
import type { PerformanceDrift } from "./performance-drift";
import type { ShadowValidationSession } from "./shadow-validation";
import type { SignalReviewDecision } from "./signal-review";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_TARGET = Date.UTC(2026, 0, 15);

function driftWindow(windowWeeks: number, mae: number) {
  return {
    windowWeeks,
    sampleCount: windowWeeks,
    maeKrwPerL: mae,
    mapePct: mae / 20,
    maxAbsoluteErrorKrwPerL: mae * 2,
    directionAccuracyRatio: 0.69,
  };
}

function drift(status: PerformanceDrift["status"]): PerformanceDrift {
  return {
    version: 1,
    evaluatedAt: "2026-06-01T00:00:00.000Z",
    status,
    degradedWeekCount: status === "alert" ? 2 : 0,
    lastEvaluatedWeekEndDate: "2026-05-28T00:00:00.000Z",
    short: driftWindow(4, status === "stable" ? 22.4 : 42.1),
    medium: driftWindow(13, 28.4),
    long: driftWindow(26, 31.7),
    reasons: [],
  };
}

function persistence(confirmedCount: number): CandidatePersistence {
  return {
    version: CANDIDATE_PERSISTENCE_VERSION,
    status: confirmedCount >= 2 ? "confirmed" : "confirming",
    candidateFingerprint: "cap-1",
    candidateParams: FALLBACK_FORECAST_MODEL_PARAMS,
    candidateSource: "parameter-sensitivity:cap",
    confirmedCount,
    requiredCount: 2,
    lastConfirmedWeekEndDate: "2026-05-28T00:00:00.000Z",
    startedAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
}

function shadow(completed: number, status: ShadowValidationSession["status"] = "validating"): ShadowValidationSession {
  return {
    version: 1,
    sessionId: "session",
    status,
    stoppedReason: null,
    startedAt: "2026-03-01T00:00:00.000Z",
    completedAt: null,
    baselineModelVersion: "weekly-anchor-trend-v2",
    baselineParams: FALLBACK_FORECAST_MODEL_PARAMS,
    candidateParams: { ...FALLBACK_FORECAST_MODEL_PARAMS, trendLookbackWeeks: 6 },
    candidateFingerprint: "candidate",
    candidateSource: "parameter-sensitivity:trendLookback",
    requiredSampleCount: 13,
    observations: Array.from({ length: completed }, (_, index) => ({
      originWeekEndDate: new Date(FIRST_TARGET + index * WEEK_MS).toISOString(),
      targetDate: new Date(FIRST_TARGET + (index + 1) * WEEK_MS).toISOString(),
      issuedAt: new Date(FIRST_TARGET + index * WEEK_MS).toISOString(),
      anchorKrwPerL: 1990,
      baselineForecastKrwPerL: 2020,
      shadowForecastKrwPerL: 1999,
      actualKrwPerL: 1998,
      baselineAbsoluteErrorKrwPerL: 22,
      shadowAbsoluteErrorKrwPerL: 1,
      baselineApePct: 1.1,
      shadowApePct: 0.05,
      baselineDirection: "up" as const,
      shadowDirection: "up" as const,
      actualDirection: "up" as const,
    })),
  };
}

function inputQuality(level: ForecastInputQuality["level"]): ForecastInputQuality {
  return {
    version: 1,
    evaluatedAt: "2026-06-01T00:00:00.000Z",
    level,
    results: [
      {
        source: "usdKrw",
        status: level === "ok" ? "healthy" : "stale",
        usable: level === "ok",
        latestDataDate: "2026-05-20T00:00:00.000Z",
        sampleCount: 12,
        reasonCode: level === "ok" ? null : "usdKrw-stale",
      },
    ],
    usableInputs: {
      weeklyDiesel: level !== "action-required",
      dailyDiesel: true,
      dubai: true,
      usdKrw: level === "ok",
    },
  };
}

function build(overrides: Partial<BuildOperationsStatusCenterInput> = {}) {
  return buildOperationsStatusCenter({
    hasForecastRun: true,
    inputQuality: inputQuality("ok"),
    performanceDrift: drift("stable"),
    persistence: null,
    shadow: null,
    transitionStatus: "not-ready",
    rollbackReviewable: false,
    signalReview: [],
    horizonPerformance: null,
    intervalForward: null,
    topCandidateLabel: null,
    ...overrides,
  });
}

test("a clean run reports healthy with nothing to check", () => {
  const center = build();

  assert.equal(center.status, "healthy");
  assert.equal(center.primaryAction, null);
  assert.deepEqual(center.items, []);
});

test("verification in progress stays an observation, not a warning", () => {
  const center = build({ persistence: persistence(1), shadow: shadow(5) });

  assert.equal(center.status, "watch");
  assert.equal(center.primaryAction, null);
  assert.deepEqual(
    center.observations.map((item) => item.key),
    ["shadow-progress", "candidate-persistence"],
  );
  assert.equal(center.observations[0].key, "shadow-progress");
});

test("a drift alert raises attention while a watch stays an observation", () => {
  assert.equal(build({ performanceDrift: drift("watch") }).status, "watch");
  assert.equal(build({ performanceDrift: drift("alert") }).status, "attention");
});

test("input data problems outrank a performance warning", () => {
  const center = build({
    inputQuality: inputQuality("attention"),
    performanceDrift: drift("alert"),
  });

  assert.equal(center.primaryAction?.source, "input-quality");
  assert.match(center.items[1].detail, /입력 데이터 이상이 함께 감지되었습니다/);
});

test("admin decisions outrank every diagnostic", () => {
  const center = build({
    inputQuality: inputQuality("attention"),
    performanceDrift: drift("alert"),
    transitionStatus: "approvable",
    rollbackReviewable: true,
  });

  assert.equal(center.status, "action-required");
  assert.equal(center.primaryAction?.key, "rollback");
  assert.deepEqual(
    center.items.map((item) => item.key),
    ["rollback", "transition-approvable", "input-quality", "performance-drift"],
  );
});

test("a finished shadow window asks for a transition review", () => {
  const center = build({ shadow: shadow(13) });

  assert.equal(center.status, "action-required");
  assert.equal(center.primaryAction?.key, "shadow-reviewable");
});

test("a stopped shadow session never asks for approval", () => {
  const center = build({ shadow: shadow(13, "stopped") });

  assert.equal(center.status, "watch");
  assert.match(center.observations[0].detail, /현재 운영 모델을 유지합니다/);
});

test("a running shadow turns candidate progress into the next shadow candidate", () => {
  const confirming = build({ persistence: persistence(1), shadow: shadow(4) });
  const confirmed = build({ persistence: persistence(2), shadow: shadow(4) });
  const idle = build({ persistence: persistence(1) });

  assert.match(
    confirming.observations.find((item) => item.key === "candidate-persistence")?.title ?? "",
    /차기 Shadow 후보 확인 1\/2주/,
  );
  assert.match(
    confirming.observations.find((item) => item.key === "candidate-persistence")?.detail ?? "",
    /현재 Shadow 검증과 별도로 차기 후보의 연속 성능을 확인합니다/,
  );
  assert.equal(
    confirmed.observations.find((item) => item.key === "candidate-persistence")?.title,
    "차기 Shadow 후보 확정",
  );
  assert.match(
    idle.observations.find((item) => item.key === "candidate-persistence")?.title ?? "",
    /1순위 후보 연속 확인 1\/2주/,
  );
  assert.equal(confirmed.stages[0].label, "차기 Shadow 후보 확인 2/2");
  assert.equal(idle.stages[0].label, "1순위 후보 연속 확인 1/2");
});

test("a removal review and a narrow interval are separate attention items", () => {
  const signalReview: SignalReviewDecision[] = [
    {
      signal: "dailySignal",
      status: "review-removal",
      backtestVerdict: "harmful",
      forwardVerdict: "worsened",
      forwardSampleCount: 13,
      forwardRequiredSampleCount: 13,
      dataQualityStatus: "healthy",
      reasons: ["backtest-harmful", "forward-harmful"],
    },
  ];
  const intervalForward: IntervalForwardValidation = {
    version: 1,
    targetCoverage: 0.8,
    observations: Array.from({ length: 10 }, (_, index) => ({
      horizonWeeks: 8,
      originWeekEndDate: new Date(FIRST_TARGET + index * WEEK_MS).toISOString(),
      targetDate: new Date(FIRST_TARGET + (index + 8) * WEEK_MS).toISOString(),
      issuedAt: new Date(FIRST_TARGET + index * WEEK_MS).toISOString(),
      forecastKrwPerL: 2050,
      lowerKrwPerL: 2040,
      upperKrwPerL: 2060,
      actualKrwPerL: index < 3 ? 2050 : 2200,
      hit: index < 3,
      intervalVersion: 1,
      calibrationSampleCount: 20,
      calibrationSource: "horizon" as const,
    })),
  };
  const center = build({ signalReview, intervalForward });

  assert.deepEqual(
    center.items.map((item) => item.key),
    ["signal-review", "interval-too-narrow"],
  );
  assert.match(center.items[1].detail, /중심 예측값 문제와는 별개입니다/);
});

test("long horizon degradation stays a low priority note", () => {
  const center = build({
    horizonPerformance: {
      version: 1,
      evaluatedAt: "2026-06-01T00:00:00.000Z",
      horizons: [],
      bands: [],
      degradationStartHorizonWeeks: 8,
      overall: { sampleCount: 100, maeKrwPerL: 30, mapePct: 1.5 },
    },
  });

  assert.equal(center.status, "watch");
  assert.equal(center.observations[0].key, "horizon-degradation");
});

test("missing diagnostics never become warnings", () => {
  const center = build({ inputQuality: null, performanceDrift: null });

  assert.equal(center.status, "healthy");
});

test("a project without any forecast run reports it plainly", () => {
  const center = build({ hasForecastRun: false });

  assert.equal(center.status, "unknown");
  assert.deepEqual(center.items, []);
});
