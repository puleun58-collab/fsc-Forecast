import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORECAST_PROMOTION_THRESHOLDS,
  mapPromotionReason,
  readForecastModelDiagnostics,
} from './forecast-diagnostics';

const MODEL_A_PARAMS = {
  modelId: 'A',
  trendLookbackWeeks: 8,
  dubai: null,
  usdKrw: null,
  externalAdjustmentCapRatio: 0.02,
};

const MODEL_C_PARAMS = {
  modelId: 'C',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 2, weight: 0.15 },
  usdKrw: { lagWeeks: 1, weight: 0.05 },
  externalAdjustmentCapRatio: 0.02,
};

function createMetadata(overrides: Record<string, unknown> = {}) {
  return {
    model: {
      version: 'weekly-anchor-trend-v2',
      promotedAt: '2026-08-18T00:00:00.000Z',
      params: MODEL_C_PARAMS,
      promoted: true,
      promotionReason: 'promoted_recent_improvement_with_long_stability',
      previousParams: MODEL_A_PARAMS,
      maeImprovementRatio: 0.062,
      mapeImprovementPctPoint: 0.12,
      evaluatedCandidateCount: 225,
      bestByModelId: {
        A: {
          modelId: 'A',
          params: MODEL_A_PARAMS,
          recentSampleCount: 20,
          recentMaeKrwPerL: 18.42,
          recentMapePct: 0.97,
          longMaeKrwPerL: 36.1,
          maxAbsoluteErrorKrwPerL: 55.2,
          forecastChurnKrwPerL: 4.1,
        },
        B: {
          modelId: 'B',
          params: { ...MODEL_C_PARAMS, modelId: 'B', usdKrw: null },
          recentSampleCount: 5,
          recentMaeKrwPerL: 17.31,
          recentMapePct: 0.91,
          longMaeKrwPerL: 35.88,
          maxAbsoluteErrorKrwPerL: 53.4,
          forecastChurnKrwPerL: 4.4,
        },
        C: {
          modelId: 'C',
          params: MODEL_C_PARAMS,
          recentSampleCount: 20,
          recentMaeKrwPerL: 17.05,
          recentMapePct: 0.89,
          longMaeKrwPerL: 39.7,
          maxAbsoluteErrorKrwPerL: 67.5,
          forecastChurnKrwPerL: 5.2,
        },
      },
      recent: {
        sampleCount: 20,
        maeKrwPerL: 17.05,
        mapePct: 0.89,
        maxAbsoluteErrorKrwPerL: 67.5,
        forecastChurnKrwPerL: 5.2,
      },
      long: { sampleCount: 40, maeKrwPerL: 39.7, mapePct: 2.1, maxAbsoluteErrorKrwPerL: 80.1, forecastChurnKrwPerL: 5.9 },
      currentModelRecent: {
        sampleCount: 20,
        maeKrwPerL: 18.42,
        mapePct: 0.97,
        maxAbsoluteErrorKrwPerL: 55.2,
        forecastChurnKrwPerL: 4.1,
      },
      ...overrides,
    },
  };
}

test('diagnostics expose the selected model, promotion outcome, and candidate table', () => {
  const diagnostics = readForecastModelDiagnostics(createMetadata());

  assert.ok(diagnostics);
  assert.equal(diagnostics.selectedParams.modelId, 'C');
  assert.equal(diagnostics.modelVersion, 'weekly-anchor-trend-v2');
  assert.equal(diagnostics.promoted, true);
  assert.equal(diagnostics.previousModelId, 'A');
  assert.equal(diagnostics.modelChanged, true);
  assert.equal(diagnostics.evaluatedCandidateCount, 225);
  assert.equal(diagnostics.recent?.maeKrwPerL, 17.05);
  assert.equal(diagnostics.long?.maeKrwPerL, 39.7);
  assert.equal(diagnostics.currentModelRecent?.maeKrwPerL, 18.42);
  assert.deepEqual(
    diagnostics.candidates.map((candidate) => [candidate.modelId, candidate.status]),
    [
      ['A', 'candidate'],
      ['B', 'insufficient_sample'],
      ['C', 'selected'],
    ],
  );
  assert.equal(diagnostics.candidates[2].params.dubai?.weight, 0.15);
});

test('diagnostics translate the promotion reason into an admin sentence', () => {
  const diagnostics = readForecastModelDiagnostics(
    createMetadata({ promoted: false, promotionReason: 'kept_current_model_promotion_cooldown' }),
  );

  assert.equal(
    diagnostics?.promotionReasonText,
    '최근 모델 변경 후 안정화 기간이 지나지 않아 현재 모델을 유지합니다.',
  );
  assert.equal(
    mapPromotionReason('kept_current_model_long_window_degraded'),
    '후보 모델의 장기 성능이 안정성 기준을 충족하지 못했습니다.',
  );
  assert.equal(mapPromotionReason(null), '판단 사유 기록 없음');
  assert.equal(mapPromotionReason('unknown_reason'), '기록된 사유 코드: unknown_reason');
});

test('diagnostics keep missing metrics null instead of coercing them to zero', () => {
  const diagnostics = readForecastModelDiagnostics(
    createMetadata({
      promotedAt: null,
      maeImprovementRatio: null,
      mapeImprovementPctPoint: null,
      recent: {
        sampleCount: 0,
        maeKrwPerL: null,
        mapePct: null,
        maxAbsoluteErrorKrwPerL: null,
        forecastChurnKrwPerL: null,
      },
      bestByModelId: null,
    }),
  );

  assert.ok(diagnostics);
  assert.equal(diagnostics.promotedAt, null);
  assert.equal(diagnostics.maeImprovementRatio, null);
  assert.equal(diagnostics.mapeImprovementPctPoint, null);
  assert.equal(diagnostics.recent?.maeKrwPerL, null);
  assert.equal(diagnostics.recent?.sampleCount, 0);
  assert.deepEqual(diagnostics.candidates, []);
});

test('diagnostics reader rejects metadata without a model selection block', () => {
  assert.equal(readForecastModelDiagnostics(null), null);
  assert.equal(readForecastModelDiagnostics({ qualityGate: {} }), null);
  assert.equal(readForecastModelDiagnostics({ model: { version: 'x' } }), null);
});

test('promotion thresholds are read from the forecast model config', () => {
  const labels = FORECAST_PROMOTION_THRESHOLDS.map((threshold) => threshold.label);

  assert.ok(labels.includes('승격 쿨다운'));
  assert.ok(labels.includes('최근 MAE 최소 개선 기준'));
  assert.deepEqual(
    FORECAST_PROMOTION_THRESHOLDS.find((threshold) => threshold.label === '승격 쿨다운'),
    { label: '승격 쿨다운', value: '14일' },
  );
  assert.deepEqual(
    FORECAST_PROMOTION_THRESHOLDS.find((threshold) => threshold.label === '승격 최소 표본 수'),
    { label: '승격 최소 표본 수', value: '13개' },
  );
});
