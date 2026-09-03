import assert from 'node:assert/strict';
import test from 'node:test';

import type { ForecastModelParams } from './forecast-model-config';
import {
  evaluateRollbackEligibility,
  evaluateTransitionEligibility,
  resolvePendingTransition,
  type EvaluateRollbackEligibilityInput,
  type EvaluateTransitionEligibilityInput,
} from './model-transition';
import type { PostTransitionMonitoring } from './post-transition-monitoring';
import type { ParameterSensitivity } from './parameter-sensitivity';
import {
  buildCandidateFingerprint,
  SHADOW_REQUIRED_SAMPLE_COUNT,
  type ShadowObservation,
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

const CANDIDATE: ForecastModelParams = { ...BASELINE, trendLookbackWeeks: 6 };

function observation(index: number, shadowError: number, baselineError: number): ShadowObservation {
  const anchor = 1800;
  const actual = 1800 + index;

  return {
    originWeekEndDate: new Date(Date.UTC(2026, 8, 3 + index * 7)).toISOString(),
    targetDate: new Date(Date.UTC(2026, 8, 10 + index * 7)).toISOString(),
    issuedAt: new Date(Date.UTC(2026, 8, 3 + index * 7)).toISOString(),
    anchorKrwPerL: anchor,
    baselineForecastKrwPerL: actual + baselineError,
    shadowForecastKrwPerL: actual + shadowError,
    actualKrwPerL: actual,
    baselineAbsoluteErrorKrwPerL: baselineError,
    shadowAbsoluteErrorKrwPerL: shadowError,
    baselineApePct: (baselineError / actual) * 100,
    shadowApePct: (shadowError / actual) * 100,
    baselineDirection: 'up',
    shadowDirection: 'up',
    actualDirection: 'up',
  };
}

function session(overrides: Partial<ShadowValidationSession> = {}): ShadowValidationSession {
  return {
    version: 1,
    sessionId: 'session-1',
    status: 'validating',
    stoppedReason: null,
    startedAt: '2026-09-02T00:00:00.000Z',
    completedAt: null,
    baselineModelVersion: MODEL_VERSION,
    baselineParams: BASELINE,
    candidateParams: CANDIDATE,
    candidateFingerprint: buildCandidateFingerprint(CANDIDATE, MODEL_VERSION),
    candidateSource: 'parameter-sensitivity:trendLookback',
    requiredSampleCount: SHADOW_REQUIRED_SAMPLE_COUNT,
    observations: Array.from({ length: SHADOW_REQUIRED_SAMPLE_COUNT }, (_, index) =>
      observation(index, 10, 24),
    ),
    ...overrides,
  };
}

function evaluate(
  overrides: Partial<EvaluateTransitionEligibilityInput> = {},
): ReturnType<typeof evaluateTransitionEligibility> {
  return evaluateTransitionEligibility({
    session: session(),
    currentParams: BASELINE,
    currentPromotedAt: new Date('2026-06-01T00:00:00.000Z'),
    modelVersion: MODEL_VERSION,
    sensitivity: null,
    hasPendingTransition: false,
    now: new Date('2026-09-02T00:00:00.000Z'),
    ...overrides,
  });
}

test('a completed and qualified shadow session can be approved for transition', () => {
  const eligibility = evaluate();

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.blockReason, null);
  assert.equal(eligibility.summary.status, 'reviewable');
  assert.equal(eligibility.candidateFingerprint, buildCandidateFingerprint(CANDIDATE, MODEL_VERSION));
  assert.equal(eligibility.baselineFingerprint, buildCandidateFingerprint(BASELINE, MODEL_VERSION));
});

test('an incomplete sample count blocks approval', () => {
  const eligibility = evaluate({
    session: session({
      observations: Array.from({ length: SHADOW_REQUIRED_SAMPLE_COUNT - 1 }, (_, index) =>
        observation(index, 10, 24),
      ),
    }),
  });

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.blockReason, 'sample_not_complete');
});

test('a shadow candidate that failed the quality rules cannot be approved', () => {
  const eligibility = evaluate({
    session: session({
      observations: Array.from({ length: SHADOW_REQUIRED_SAMPLE_COUNT }, (_, index) =>
        observation(index, 26, 24),
      ),
    }),
  });

  assert.equal(eligibility.summary.status, 'failed');
  assert.equal(eligibility.blockReason, 'shadow_not_reviewable');
});

test('a baseline or model version change invalidates the approval', () => {
  assert.equal(
    evaluate({ currentParams: { ...BASELINE, trendLookbackWeeks: 10 } }).blockReason,
    'baseline_mismatch',
  );
  assert.equal(
    evaluate({ modelVersion: 'weekly-anchor-trend-v3' }).blockReason,
    'model_version_mismatch',
  );
});

test('the existing promotion cooldown also protects the manual transition', () => {
  const eligibility = evaluate({
    currentPromotedAt: new Date('2026-08-30T00:00:00.000Z'),
  });

  assert.equal(eligibility.blockReason, 'cooldown_active');
  assert.equal(eligibility.cooldownRemainingDays, 11);
});

test('a pending approval blocks a second approval for the same dataset', () => {
  assert.equal(evaluate({ hasPendingTransition: true }).blockReason, 'already_approved');
});

test('a candidate that broke the latest long-window guardrail cannot transition', () => {
  const sensitivity = {
    groups: [
      {
        key: 'trendLookback',
        status: 'evaluated',
        notApplicableReason: null,
        candidates: [
          {
            label: '6주',
            params: CANDIDATE,
            isCurrent: false,
            recentOneStep: {
              sampleCount: 13,
              maeKrwPerL: 18,
              mapePct: 1,
              maxAbsoluteErrorKrwPerL: 40,
              directionAccuracyRatio: 0.7,
              forecastChurnKrwPerL: 4,
            },
            longOneStep: {
              sampleCount: 26,
              maeKrwPerL: 40,
              mapePct: 2,
              maxAbsoluteErrorKrwPerL: 80,
              directionAccuracyRatio: 0.6,
              forecastChurnKrwPerL: 5,
            },
            qualityChecks: {
              maeImprovementRatio: 0.2,
              mapeImprovementPctPoint: 0.3,
              meetsMinimumImprovement: true,
              longStable: false,
              maxErrorStable: true,
              churnStable: true,
            },
          },
        ],
      },
    ],
  } as unknown as ParameterSensitivity;

  assert.equal(evaluate({ sensitivity }).blockReason, 'candidate_guardrail_broken');
});

test('a pending transition applies only when baseline and model version still match', () => {
  const record = {
    status: 'approved_pending',
    modelVersion: MODEL_VERSION,
    baselineFingerprint: buildCandidateFingerprint(BASELINE, MODEL_VERSION),
    candidateParams: CANDIDATE,
  };

  assert.deepEqual(resolvePendingTransition(record, BASELINE, MODEL_VERSION), {
    action: 'apply',
    candidateParams: CANDIDATE,
  });
  assert.deepEqual(
    resolvePendingTransition(record, { ...BASELINE, trendLookbackWeeks: 4 }, MODEL_VERSION),
    { action: 'cancel', reason: 'baseline_changed_before_application' },
  );
  assert.deepEqual(resolvePendingTransition(record, BASELINE, 'weekly-anchor-trend-v3'), {
    action: 'cancel',
    reason: 'model_version_changed_before_application',
  });
});

test('an already applied transition is never applied again', () => {
  assert.deepEqual(
    resolvePendingTransition(
      {
        status: 'applied',
        modelVersion: MODEL_VERSION,
        baselineFingerprint: buildCandidateFingerprint(BASELINE, MODEL_VERSION),
        candidateParams: CANDIDATE,
      },
      BASELINE,
      MODEL_VERSION,
    ),
    { action: 'skip' },
  );
  assert.deepEqual(resolvePendingTransition(null, BASELINE, MODEL_VERSION), { action: 'skip' });
});

function monitoringWith(
  errors: { current: number; rollback: number },
  count = SHADOW_REQUIRED_SAMPLE_COUNT,
): PostTransitionMonitoring {
  return {
    version: 1,
    sourceTransitionId: 'transition-1',
    modelVersion: MODEL_VERSION,
    currentParams: CANDIDATE,
    rollbackParams: BASELINE,
    startedAt: '2026-09-03T00:00:00.000Z',
    status: 'monitoring',
    stoppedReason: null,
    requiredSampleCount: SHADOW_REQUIRED_SAMPLE_COUNT,
    observations: Array.from({ length: count }, (_, index) =>
      observation(index, errors.rollback, errors.current),
    ),
  };
}

function evaluateRollback(
  overrides: Partial<EvaluateRollbackEligibilityInput> = {},
): ReturnType<typeof evaluateRollbackEligibility> {
  return evaluateRollbackEligibility({
    monitoring: monitoringWith({ current: 30, rollback: 10 }),
    currentParams: CANDIDATE,
    currentPromotedAt: new Date('2026-06-01T00:00:00.000Z'),
    modelVersion: MODEL_VERSION,
    sensitivity: null,
    hasPendingTransition: false,
    now: new Date('2026-12-02T00:00:00.000Z'),
    ...overrides,
  });
}

test('a rollback is approvable when the previous setting wins by the existing rules', () => {
  const eligibility = evaluateRollback();

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.summary.status, 'rollback_reviewable');
  assert.equal(eligibility.rollbackFingerprint, buildCandidateFingerprint(BASELINE, MODEL_VERSION));
  assert.equal(eligibility.currentFingerprint, buildCandidateFingerprint(CANDIDATE, MODEL_VERSION));
});

test('a rollback stays blocked before the required sample count and while the current setting leads', () => {
  assert.equal(
    evaluateRollback({
      monitoring: monitoringWith({ current: 30, rollback: 10 }, SHADOW_REQUIRED_SAMPLE_COUNT - 1),
    }).blockReason,
    'sample_not_complete',
  );
  assert.equal(
    evaluateRollback({ monitoring: monitoringWith({ current: 10, rollback: 30 }) }).blockReason,
    'monitoring_not_reviewable',
  );
});

test('a rollback is refused when the operating setting, version, cooldown, or pending state changed', () => {
  assert.equal(
    evaluateRollback({ currentParams: { ...CANDIDATE, trendLookbackWeeks: 4 } }).blockReason,
    'current_params_mismatch',
  );
  assert.equal(
    evaluateRollback({ modelVersion: 'weekly-anchor-trend-v3' }).blockReason,
    'model_version_mismatch',
  );
  assert.equal(
    evaluateRollback({ currentPromotedAt: new Date('2026-11-30T00:00:00.000Z') }).blockReason,
    'cooldown_active',
  );
  assert.equal(evaluateRollback({ hasPendingTransition: true }).blockReason, 'already_approved');
});
