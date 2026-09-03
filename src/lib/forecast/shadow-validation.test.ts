import assert from 'node:assert/strict';
import test from 'node:test';

import type { ForecastModelParams } from './forecast-model-config';
import {
  buildCandidateFingerprint,
  type ShadowCandidateInput,
  readShadowValidation,
  recordShadowCycle,
  resolveShadowSession,
  SHADOW_REQUIRED_SAMPLE_COUNT,
  summarizeShadowValidation,
  type ShadowValidationSession,
} from './shadow-validation';

const MODEL_VERSION = 'weekly-anchor-trend-v2';

const BASELINE: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const CANDIDATE_PARAMS: ForecastModelParams = { ...BASELINE, trendLookbackWeeks: 6 };

function tuningCandidate(params = CANDIDATE_PARAMS, meets = true): ShadowCandidateInput {
  return {
    params,
    meetsPromotionQuality: meets,
    source: 'parameter-sensitivity:trendLookback',
  };
}

function weekDate(index: number): Date {
  return new Date(Date.UTC(2026, 8, 4 + index * 7));
}

function startSession(now = new Date('2026-09-02T00:00:00.000Z')): ShadowValidationSession {
  const session = resolveShadowSession({
    previousSession: null,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [tuningCandidate()],
    now,
  });

  assert.ok(session);
  return session;
}

function runCycle(
  session: ShadowValidationSession,
  index: number,
  errors: { baseline: number; shadow: number },
  confirmedWeeks: { targetDate: Date; actualKrwPerL: number }[],
): ShadowValidationSession {
  return recordShadowCycle({
    session,
    confirmedWeeks,
    now: new Date(Date.UTC(2026, 8, 3 + index * 7)),
    prediction: {
      originWeekEndDate: weekDate(index - 1),
      targetDate: weekDate(index),
      anchorKrwPerL: 1800,
      baselineForecastKrwPerL: 1800 + errors.baseline,
      shadowForecastKrwPerL: 1800 + errors.shadow,
      issuedAt: new Date(Date.UTC(2026, 8, 3 + index * 7)),
    },
  });
}

test('a session starts only from a qualified sensitivity candidate that differs from the baseline', () => {
  const started = startSession();
  const sameAsBaseline = resolveShadowSession({
    previousSession: null,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [tuningCandidate(BASELINE)],
    now: new Date(),
  });
  const unqualified = resolveShadowSession({
    previousSession: null,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [tuningCandidate(CANDIDATE_PARAMS, false)],
    now: new Date(),
  });

  assert.equal(started.status, 'validating');
  assert.equal(started.candidateParams.trendLookbackWeeks, 6);
  assert.equal(started.requiredSampleCount, SHADOW_REQUIRED_SAMPLE_COUNT);
  assert.deepEqual(started.observations, []);
  assert.equal(sameAsBaseline, null);
  assert.equal(unqualified, null);
});

test('repeated pipeline runs for the same target week add only one observation', () => {
  let session = startSession();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    session = runCycle(session, 1, { baseline: 10, shadow: 6 }, []);
  }

  assert.equal(session.observations.length, 1);
  assert.equal(session.observations[0]?.baselineForecastKrwPerL, 1810);
});

test('an issued prediction is never overwritten by later runs', () => {
  let session = startSession();
  session = runCycle(session, 1, { baseline: 10, shadow: 6 }, []);
  session = runCycle(session, 1, { baseline: 99, shadow: 99 }, []);

  assert.equal(session.observations[0]?.baselineForecastKrwPerL, 1810);
  assert.equal(session.observations[0]?.shadowForecastKrwPerL, 1806);
});

test('confirmed actuals evaluate observations pairwise on the same target week', () => {
  let session = startSession();
  session = runCycle(session, 1, { baseline: 20, shadow: 10 }, []);
  session = runCycle(session, 2, { baseline: 30, shadow: 15 }, [
    { targetDate: weekDate(1), actualKrwPerL: 1800 },
  ]);
  session = recordShadowCycle({
    session,
    confirmedWeeks: [
      { targetDate: weekDate(1), actualKrwPerL: 1800 },
      { targetDate: weekDate(2), actualKrwPerL: 1800 },
    ],
    prediction: null,
    now: new Date(),
  });
  const summary = summarizeShadowValidation(session);

  assert.equal(summary.completedSampleCount, 2);
  assert.equal(summary.baseline.maeKrwPerL, 25);
  assert.equal(summary.shadow.maeKrwPerL, 12.5);
  assert.equal(summary.status, 'validating');
});

test('direction hits follow the anchor comparison used by the backtest', () => {
  let session = startSession();
  session = recordShadowCycle({
    session,
    confirmedWeeks: [],
    now: new Date(),
    prediction: {
      originWeekEndDate: weekDate(0),
      targetDate: weekDate(1),
      anchorKrwPerL: 1800,
      baselineForecastKrwPerL: 1790,
      shadowForecastKrwPerL: 1820,
      issuedAt: new Date(),
    },
  });
  session = recordShadowCycle({
    session,
    confirmedWeeks: [{ targetDate: weekDate(1), actualKrwPerL: 1830 }],
    prediction: null,
    now: new Date(),
  });
  const [observation] = session.observations;

  assert.equal(observation?.actualDirection, 'up');
  assert.equal(observation?.shadowDirection, 'up');
  assert.equal(observation?.baselineDirection, 'down');
});

test('a session stays validating until the required sample count is reached', () => {
  let session = startSession();
  const confirmed: { targetDate: Date; actualKrwPerL: number }[] = [];

  for (let index = 1; index <= SHADOW_REQUIRED_SAMPLE_COUNT - 1; index += 1) {
    session = runCycle(session, index, { baseline: 24, shadow: 12 }, [...confirmed]);
    confirmed.push({ targetDate: weekDate(index), actualKrwPerL: 1800 });
  }

  session = recordShadowCycle({ session, confirmedWeeks: confirmed, prediction: null, now: new Date() });
  const summary = summarizeShadowValidation(session);

  assert.equal(summary.completedSampleCount, SHADOW_REQUIRED_SAMPLE_COUNT - 1);
  assert.equal(summary.status, 'validating');
  assert.equal(session.status, 'validating');
});

test('a completed session becomes reviewable or failed by the existing promotion quality rules', () => {
  const buildCompleted = (shadowError: number, shadowMaxError: number): ShadowValidationSession => {
    let session = startSession();
    const confirmed: { targetDate: Date; actualKrwPerL: number }[] = [];

    for (let index = 1; index <= SHADOW_REQUIRED_SAMPLE_COUNT; index += 1) {
      // 예측값을 주마다 흔들어 실제 운영과 비슷한 변동성을 만든다.
      const jitter = index % 2 === 0 ? 2 : 0;
      const error = index === 1 ? shadowMaxError : shadowError + jitter;
      session = runCycle(session, index, { baseline: 24 + jitter, shadow: error }, [...confirmed]);
      confirmed.push({ targetDate: weekDate(index), actualKrwPerL: 1800 });
    }

    return recordShadowCycle({ session, confirmedWeeks: confirmed, prediction: null, now: new Date() });
  };
  const reviewable = summarizeShadowValidation(buildCompleted(12, 14));
  const failedByMaxError = summarizeShadowValidation(buildCompleted(12, 200));
  const failedByImprovement = summarizeShadowValidation(buildCompleted(24, 24));

  assert.equal(reviewable.status, 'reviewable');
  assert.equal(reviewable.qualityChecks.meetsMinimumImprovement, true);
  assert.equal(failedByMaxError.status, 'failed');
  assert.equal(failedByMaxError.qualityChecks.maxErrorStable, false);
  assert.equal(failedByImprovement.status, 'failed');
  assert.equal(failedByImprovement.qualityChecks.meetsMinimumImprovement, false);
});

test('changing the operating parameters or model version stops the session', () => {
  const session = startSession();
  const baselineChanged = resolveShadowSession({
    previousSession: session,
    modelVersion: MODEL_VERSION,
    baselineParams: { ...BASELINE, trendLookbackWeeks: 10 },
    candidates: [tuningCandidate()],
    now: new Date(),
  });
  const versionChanged = resolveShadowSession({
    previousSession: session,
    modelVersion: 'weekly-anchor-trend-v3',
    baselineParams: BASELINE,
    candidates: [tuningCandidate()],
    now: new Date(),
  });

  assert.equal(baselineChanged?.status, 'stopped');
  assert.equal(baselineChanged?.stoppedReason, 'baseline_params_changed');
  assert.equal(versionChanged?.status, 'stopped');
  assert.equal(versionChanged?.stoppedReason, 'model_version_changed');
});

test('an in-flight session keeps its candidate even when a better candidate appears', () => {
  const session = startSession();
  const carried = resolveShadowSession({
    previousSession: session,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [tuningCandidate({ ...BASELINE, trendLookbackWeeks: 4 })],
    now: new Date(),
  });

  assert.equal(carried?.sessionId, session.sessionId);
  assert.equal(carried?.candidateParams.trendLookbackWeeks, 6);
});

test('a finished session never restarts with the same candidate fingerprint', () => {
  const finished: ShadowValidationSession = { ...startSession(), status: 'failed' };
  const next = resolveShadowSession({
    previousSession: finished,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [tuningCandidate()],
    now: new Date(),
  });
  const otherCandidate = resolveShadowSession({
    previousSession: finished,
    modelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidates: [tuningCandidate({ ...BASELINE, trendLookbackWeeks: 4 })],
    now: new Date(),
  });

  assert.equal(next?.sessionId, finished.sessionId);
  assert.equal(otherCandidate?.candidateParams.trendLookbackWeeks, 4);
  assert.equal(
    buildCandidateFingerprint(CANDIDATE_PARAMS, MODEL_VERSION) !==
      buildCandidateFingerprint({ ...BASELINE, trendLookbackWeeks: 4 }, MODEL_VERSION),
    true,
  );
});

test('metadata without a shadow block reads as missing', () => {
  assert.equal(readShadowValidation(null), null);
  assert.equal(readShadowValidation({ model: {} }), null);
  assert.equal(
    readShadowValidation({ model: { shadowValidation: startSession() } })?.status,
    'validating',
  );
});
