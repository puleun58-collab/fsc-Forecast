import assert from 'node:assert/strict';
import test from 'node:test';

import type { ForecastModelParams } from './forecast-model-config';
import {
  POST_TRANSITION_OBSERVATION_LIMIT,
  POST_TRANSITION_REQUIRED_SAMPLE_COUNT,
  readPostTransitionMonitoring,
  recordPostTransitionCycle,
  resolvePostTransitionMonitoring,
  summarizePostTransitionMonitoring,
  type PostTransitionMonitoring,
} from './post-transition-monitoring';

const MODEL_VERSION = 'weekly-anchor-trend-v2';

const ROLLBACK_PARAMS: ForecastModelParams = {
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const CURRENT_PARAMS: ForecastModelParams = { ...ROLLBACK_PARAMS, trendLookbackWeeks: 6 };

function weekDate(index: number): Date {
  return new Date(Date.UTC(2026, 8, 10 + index * 7));
}

function start(): PostTransitionMonitoring {
  const monitoring = resolvePostTransitionMonitoring({
    previous: null,
    appliedTransition: {
      transitionId: 'transition-1',
      currentParams: CURRENT_PARAMS,
      rollbackParams: ROLLBACK_PARAMS,
      sourceKind: 'shadow_admin_approved',
    },
    currentParams: CURRENT_PARAMS,
    modelVersion: MODEL_VERSION,
    now: new Date('2026-09-03T00:00:00.000Z'),
  });

  assert.ok(monitoring);
  return monitoring;
}

function runCycle(
  monitoring: PostTransitionMonitoring,
  index: number,
  errors: { current: number; rollback: number },
  confirmedWeeks: readonly { targetDate: Date; actualKrwPerL: number }[] = [],
): PostTransitionMonitoring {
  return recordPostTransitionCycle({
    monitoring,
    confirmedWeeks,
    now: weekDate(index - 1),
    prediction: {
      originWeekEndDate: weekDate(index - 1),
      targetDate: weekDate(index),
      anchorKrwPerL: 1800,
      currentForecastKrwPerL: 1800 + errors.current,
      rollbackForecastKrwPerL: 1800 + errors.rollback,
      issuedAt: weekDate(index - 1),
    },
  });
}

/** index 주차마다 예측을 발행하고 다음 주에 Actual 1800으로 확정한다. */
function runSamples(
  count: number,
  errorsAt: (index: number) => { current: number; rollback: number },
): PostTransitionMonitoring {
  let monitoring = start();

  for (let index = 0; index < count; index += 1) {
    const confirmed = Array.from({ length: index }, (_, past) => ({
      targetDate: weekDate(past),
      actualKrwPerL: 1800,
    }));
    monitoring = runCycle(monitoring, index, errorsAt(index), confirmed);
  }

  return recordPostTransitionCycle({
    monitoring,
    confirmedWeeks: Array.from({ length: count }, (_, index) => ({
      targetDate: weekDate(index),
      actualKrwPerL: 1800,
    })),
    prediction: null,
    now: weekDate(count),
  });
}

test('monitoring starts from the applied transition with the previous setting fixed', () => {
  const monitoring = start();

  assert.equal(monitoring.sourceTransitionId, 'transition-1');
  assert.deepEqual(monitoring.currentParams, CURRENT_PARAMS);
  assert.deepEqual(monitoring.rollbackParams, ROLLBACK_PARAMS);
  assert.equal(monitoring.status, 'monitoring');
  assert.deepEqual(monitoring.observations, []);
  assert.equal(monitoring.requiredSampleCount, POST_TRANSITION_REQUIRED_SAMPLE_COUNT);
});

test('repeated runs for the same target week add only one observation', () => {
  let monitoring = start();
  monitoring = runCycle(monitoring, 0, { current: 20, rollback: 10 });
  monitoring = runCycle(monitoring, 0, { current: 99, rollback: 99 });
  monitoring = runCycle(monitoring, 0, { current: 5, rollback: 5 });

  assert.equal(monitoring.observations.length, 1);
  assert.equal(monitoring.observations[0]?.baselineForecastKrwPerL, 1820);
  assert.equal(monitoring.observations[0]?.shadowForecastKrwPerL, 1810);
});

test('confirmed actuals score both settings pairwise on the same week', () => {
  const monitoring = runSamples(3, (index) => ({ current: [20, 30, 40][index] ?? 0, rollback: [10, 20, 30][index] ?? 0 }));
  const summary = summarizePostTransitionMonitoring(monitoring);

  assert.equal(summary.completedSampleCount, 3);
  assert.equal(summary.current.maeKrwPerL, 30);
  assert.equal(summary.rollback.maeKrwPerL, 20);
  assert.equal(summary.status, 'monitoring');
});

test('a worse current setting is only flagged after the required sample count', () => {
  const almost = runSamples(POST_TRANSITION_REQUIRED_SAMPLE_COUNT - 1, () => ({
    current: 30,
    rollback: 10,
  }));
  const complete = runSamples(POST_TRANSITION_REQUIRED_SAMPLE_COUNT, () => ({
    current: 30,
    rollback: 10,
  }));

  assert.equal(summarizePostTransitionMonitoring(almost).status, 'monitoring');
  assert.equal(summarizePostTransitionMonitoring(complete).status, 'rollback_reviewable');
  assert.equal(complete.status, 'rollback_reviewable');
});

test('a current setting that keeps its edge stays stable', () => {
  const monitoring = runSamples(POST_TRANSITION_REQUIRED_SAMPLE_COUNT, () => ({
    current: 10,
    rollback: 30,
  }));

  assert.equal(summarizePostTransitionMonitoring(monitoring).status, 'stable');
});

test('observations are capped while the judgement window stays at the required count', () => {
  const monitoring = runSamples(POST_TRANSITION_OBSERVATION_LIMIT + 4, () => ({
    current: 10,
    rollback: 30,
  }));
  const summary = summarizePostTransitionMonitoring(monitoring);

  assert.equal(monitoring.observations.length, POST_TRANSITION_OBSERVATION_LIMIT);
  assert.equal(summary.completedSampleCount, POST_TRANSITION_REQUIRED_SAMPLE_COUNT);
});

test('a model version or operating parameter change stops the comparison', () => {
  const monitoring = start();

  assert.equal(
    resolvePostTransitionMonitoring({
      previous: monitoring,
      appliedTransition: null,
      currentParams: CURRENT_PARAMS,
      modelVersion: 'weekly-anchor-trend-v3',
      now: new Date('2026-10-01T00:00:00.000Z'),
    })?.stoppedReason,
    'model_version_changed',
  );
  assert.equal(
    resolvePostTransitionMonitoring({
      previous: monitoring,
      appliedTransition: null,
      currentParams: { ...CURRENT_PARAMS, trendLookbackWeeks: 4 },
      modelVersion: MODEL_VERSION,
      now: new Date('2026-10-01T00:00:00.000Z'),
    })?.stoppedReason,
    'current_params_changed',
  );
});

test('an unchanged setting keeps the running comparison across later runs', () => {
  const monitoring = runSamples(3, () => ({ current: 20, rollback: 10 }));
  const carried = resolvePostTransitionMonitoring({
    previous: monitoring,
    appliedTransition: null,
    currentParams: CURRENT_PARAMS,
    modelVersion: MODEL_VERSION,
    now: new Date('2026-10-05T00:00:00.000Z'),
  });

  assert.equal(carried?.observations.length, monitoring.observations.length);
  assert.equal(carried?.stoppedReason, null);
});

test('applying the rollback closes the monitoring session', () => {
  const monitoring = runSamples(POST_TRANSITION_REQUIRED_SAMPLE_COUNT, () => ({
    current: 30,
    rollback: 10,
  }));
  const closed = resolvePostTransitionMonitoring({
    previous: monitoring,
    appliedTransition: {
      transitionId: 'transition-2',
      currentParams: ROLLBACK_PARAMS,
      rollbackParams: CURRENT_PARAMS,
      sourceKind: 'post_transition_rollback',
    },
    currentParams: ROLLBACK_PARAMS,
    modelVersion: MODEL_VERSION,
    now: new Date('2026-12-01T00:00:00.000Z'),
  });

  assert.equal(closed?.status, 'rolled_back');
  assert.equal(
    recordPostTransitionCycle({
      monitoring: closed as PostTransitionMonitoring,
      confirmedWeeks: [],
      prediction: null,
      now: new Date('2026-12-08T00:00:00.000Z'),
    }).status,
    'rolled_back',
  );
});

test('metadata without a monitoring block reads as missing', () => {
  const monitoring = start();

  assert.equal(readPostTransitionMonitoring(null), null);
  assert.equal(readPostTransitionMonitoring({ model: {} }), null);
  assert.equal(
    readPostTransitionMonitoring({ model: { postTransitionMonitoring: monitoring } })
      ?.sourceTransitionId,
    'transition-1',
  );
});
