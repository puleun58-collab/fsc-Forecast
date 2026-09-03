import assert from 'node:assert/strict';
import test from 'node:test';

import { ForecastApprovalState } from '@prisma/client';

import { buildForecastQualityGate } from './build-forecast-quality-gate';
import { FALLBACK_FORECAST_MODEL_PARAMS } from './forecast-model-config';
import {
  readForecastModelState,
  resolveForecastModelState,
  serializeForecastModelParams,
} from './forecast-model-state';

test('stored model parameters round-trip so the operating model can be reused', () => {
  const metadata = {
    model: {
      version: 'weekly-anchor-trend-v2',
      promotedAt: '2026-08-20T00:00:00.000Z',
      params: serializeForecastModelParams({
        modelId: 'C',
        trendLookbackWeeks: 8,
        dubai: { lagWeeks: 2, weight: 0.15 },
        usdKrw: { lagWeeks: 1, weight: 0.05 },
        externalAdjustmentCapRatio: 0.02,
        biasCorrection: null,
        dailySignal: null,
      }),
    },
  };
  const state = readForecastModelState(metadata);

  assert.equal(state?.params.modelId, 'C');
  assert.equal(state?.params.dubai?.lagWeeks, 2);
  assert.equal(state?.params.dubai?.weight, 0.15);
  assert.equal(state?.params.usdKrw?.weight, 0.05);
  assert.equal(state?.params.externalAdjustmentCapRatio, 0.02);
  assert.equal(state?.promotedAt?.toISOString(), '2026-08-20T00:00:00.000Z');
  assert.equal(state?.modelVersion, 'weekly-anchor-trend-v2');
});

test('unusable metadata falls back to the safe operating model', () => {
  assert.equal(readForecastModelState(null), null);
  assert.equal(readForecastModelState({ model: { params: { modelId: 'D' } } }), null);
  assert.deepEqual(resolveForecastModelState(null).params, FALLBACK_FORECAST_MODEL_PARAMS);
  assert.deepEqual(
    resolveForecastModelState({ model: { params: { modelId: 'B', trendLookbackWeeks: 8 } } }).params,
    FALLBACK_FORECAST_MODEL_PARAMS,
  );
});

test('quality gate approves on recent walk-forward MAPE and degrades on pending forecasts', () => {
  const recent = {
    windowWeeks: 13,
    sampleCount: 40,
    maeKrwPerL: 12.5,
    mapePct: 0.94,
    rmseKrwPerL: 15,
    medianAbsoluteErrorKrwPerL: 11,
    maxAbsoluteErrorKrwPerL: 30,
    directionAccuracyRatio: 0.8,
    forecastChurnKrwPerL: 4,
  };
  const approved = buildForecastQualityGate({ recent, oneStepPoints: [], unavailableReason: null });
  const degraded = buildForecastQualityGate({
    recent,
    oneStepPoints: [],
    unavailableReason: 'weekly_trend_unavailable',
  });
  const exceeded = buildForecastQualityGate({
    recent: { ...recent, mapePct: 9.4 },
    oneStepPoints: [],
    unavailableReason: null,
  });

  assert.equal(approved.approvalState, ForecastApprovalState.approved);
  assert.equal(approved.mapePct, 0.94);
  assert.equal(approved.maeKrwPerL, 12.5);
  assert.equal(approved.degradedReason, null);
  assert.equal(degraded.approvalState, ForecastApprovalState.degraded);
  assert.equal(degraded.degradedReason, 'weekly_trend_unavailable');
  assert.equal(exceeded.approvalState, ForecastApprovalState.degraded);
  assert.match(exceeded.degradedReason ?? '', /mape_threshold_exceeded/);
});
