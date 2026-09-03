import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATE_PERSISTENCE_REQUIRED_COUNT,
  isShadowEntryConfirmed,
  readCandidatePersistence,
  resolveCandidatePersistence,
  selectPersistenceCandidate,
  type CandidatePersistence,
} from "./candidate-persistence";
import type { ForecastModelParams } from "./forecast-model-config";
import {
  buildCandidateFingerprint,
  resolveShadowSession,
  type ShadowCandidateInput,
} from "./shadow-validation";

const MODEL_VERSION = "test-v1";

const BASELINE: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: "B",
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const TREND_CANDIDATE: ShadowCandidateInput = {
  params: { ...BASELINE, trendLookbackWeeks: 6 },
  meetsPromotionQuality: true,
  source: "parameter-sensitivity:trendLookback",
};

const DUBAI_CANDIDATE: ShadowCandidateInput = {
  params: { ...BASELINE, dubai: { lagWeeks: 2, weight: 0.15 } },
  meetsPromotionQuality: true,
  source: "parameter-sensitivity:dubai",
};

const WEEK_ONE = new Date("2026-08-19T00:00:00.000Z");
const WEEK_TWO = new Date("2026-08-26T00:00:00.000Z");

function confirm(
  previous: CandidatePersistence | null,
  candidate: ShadowCandidateInput | null,
  latestWeekEndDate: Date | null,
  now = new Date("2026-08-26T01:00:00.000Z"),
): CandidatePersistence {
  return resolveCandidatePersistence({
    previous,
    candidate,
    modelVersion: MODEL_VERSION,
    latestWeekEndDate,
    now,
  });
}

test("the first eligible candidate starts at one of two weeks", () => {
  const state = confirm(null, TREND_CANDIDATE, WEEK_ONE);

  assert.equal(state.status, "confirming");
  assert.equal(state.confirmedCount, 1);
  assert.equal(state.requiredCount, CANDIDATE_PERSISTENCE_REQUIRED_COUNT);
  assert.equal(state.lastConfirmedWeekEndDate, WEEK_ONE.toISOString());
  assert.equal(
    state.candidateFingerprint,
    buildCandidateFingerprint(TREND_CANDIDATE.params, MODEL_VERSION),
  );
  assert.equal(isShadowEntryConfirmed(state, TREND_CANDIDATE, MODEL_VERSION), false);
});

test("repeated runs on the same confirmed week never advance the progress", () => {
  const first = confirm(null, TREND_CANDIDATE, WEEK_ONE);
  const second = confirm(first, TREND_CANDIDATE, WEEK_ONE);
  const third = confirm(second, TREND_CANDIDATE, WEEK_ONE);

  assert.equal(third.confirmedCount, 1);
  assert.equal(third.status, "confirming");
  assert.equal(third.lastConfirmedWeekEndDate, WEEK_ONE.toISOString());
  assert.notEqual(third.updatedAt, "");
});

test("the same candidate on a new week reaches two of two and opens shadow", () => {
  const first = confirm(null, TREND_CANDIDATE, WEEK_ONE);
  const second = confirm(first, TREND_CANDIDATE, WEEK_TWO);

  assert.equal(second.status, "confirmed");
  assert.equal(second.confirmedCount, 2);
  assert.equal(isShadowEntryConfirmed(second, TREND_CANDIDATE, MODEL_VERSION), true);

  const session = resolveShadowSession({
    previousSession: null,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [TREND_CANDIDATE],
    now: new Date("2026-08-26T02:00:00.000Z"),
  });

  assert.equal(session?.status, "validating");
  assert.equal(
    session?.candidateFingerprint,
    buildCandidateFingerprint(TREND_CANDIDATE.params, MODEL_VERSION),
  );
});

test("a new top candidate discards the previous confirmation", () => {
  const first = confirm(null, TREND_CANDIDATE, WEEK_ONE);
  const switched = confirm(first, DUBAI_CANDIDATE, WEEK_TWO);

  assert.equal(switched.status, "reset");
  assert.equal(switched.confirmedCount, 1);
  assert.equal(
    switched.candidateFingerprint,
    buildCandidateFingerprint(DUBAI_CANDIDATE.params, MODEL_VERSION),
  );
  assert.equal(isShadowEntryConfirmed(switched, DUBAI_CANDIDATE, MODEL_VERSION), false);
});

test("losing the candidate resets the confirmation record", () => {
  const first = confirm(null, TREND_CANDIDATE, WEEK_ONE);
  const cleared = confirm(first, null, WEEK_TWO);

  assert.equal(cleared.status, "reset");
  assert.equal(cleared.confirmedCount, 0);
  assert.equal(cleared.candidateFingerprint, null);
  assert.equal(cleared.lastConfirmedWeekEndDate, null);

  const stillEmpty = confirm(cleared, null, WEEK_TWO);

  assert.equal(stillEmpty.status, "waiting");
});

test("only quality-passing candidates that differ from the baseline are gated", () => {
  const baselineTwin: ShadowCandidateInput = {
    params: { ...BASELINE },
    meetsPromotionQuality: true,
    source: "parameter-sensitivity:trendLookback",
  };
  const rejected: ShadowCandidateInput = { ...TREND_CANDIDATE, meetsPromotionQuality: false };

  assert.equal(selectPersistenceCandidate([], BASELINE, MODEL_VERSION), null);
  assert.equal(selectPersistenceCandidate([baselineTwin], BASELINE, MODEL_VERSION), null);
  assert.equal(selectPersistenceCandidate([rejected], BASELINE, MODEL_VERSION), null);
  assert.equal(
    selectPersistenceCandidate([rejected, TREND_CANDIDATE], BASELINE, MODEL_VERSION),
    TREND_CANDIDATE,
  );
});

test("an in-flight shadow session keeps its candidate even when the gate confirms another", () => {
  const running = resolveShadowSession({
    previousSession: null,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [TREND_CANDIDATE],
    now: new Date("2026-08-19T02:00:00.000Z"),
  });
  const confirmed = confirm(
    confirm(null, DUBAI_CANDIDATE, WEEK_ONE),
    DUBAI_CANDIDATE,
    WEEK_TWO,
  );

  assert.equal(confirmed.status, "confirmed");

  const next = resolveShadowSession({
    previousSession: running,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [DUBAI_CANDIDATE],
    now: new Date("2026-08-26T02:00:00.000Z"),
  });

  assert.equal(next?.candidateFingerprint, running?.candidateFingerprint);
  assert.equal(next?.status, "validating");
});

test("the state survives a restart through the run metadata", () => {
  const first = confirm(null, TREND_CANDIDATE, WEEK_ONE);
  const stored = JSON.parse(JSON.stringify({ model: { candidatePersistence: first } }));
  const restored = readCandidatePersistence(stored);

  assert.deepEqual(restored, first);

  const resumed = confirm(restored, TREND_CANDIDATE, WEEK_TWO);

  assert.equal(resumed.confirmedCount, 2);
  assert.equal(resumed.status, "confirmed");
});

test("older runs without the persistence block read as null", () => {
  assert.equal(readCandidatePersistence({ model: { parameterSensitivity: { version: 2 } } }), null);
  assert.equal(readCandidatePersistence(null), null);
});
