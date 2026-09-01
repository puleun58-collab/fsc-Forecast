import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminForecastDiagnostics } from './admin-forecast-diagnostics';
import { readForecastModelDiagnostics } from '@/lib/forecast/forecast-diagnostics';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

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

function createEntry(overrides: Record<string, unknown> = {}) {
  const diagnostics = readForecastModelDiagnostics({
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
        B: null,
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
      long: { sampleCount: 40, maeKrwPerL: 39.7, mapePct: 2.1 },
      currentModelRecent: { sampleCount: 20, maeKrwPerL: 18.42, mapePct: 0.97 },
      ...overrides,
    },
  });

  assert.ok(diagnostics);
  return { runId: 'run-1', completedAt: '2026-08-18T02:00:00.000Z', diagnostics };
}

test('admin diagnostics render the current model, parameters, and candidate comparison', () => {
  const entry = createEntry();
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry] }),
  );

  assert.match(markup, /예측 모델 진단/);
  assert.match(markup, /Model C/);
  assert.match(markup, /weekly-anchor-trend-v2/);
  assert.match(markup, /2026\.08\.18/);
  assert.match(markup, /Model A → Model C 승격/);
  assert.match(markup, /Lag 2주 · Weight 15\.0%/);
  assert.match(markup, /Lag 1주 · Weight 5\.0%/);
  assert.match(markup, /±2\.0%/);
  assert.match(markup, /최근 성능이 의미 있게 개선되고 장기 안정성 기준도 충족하여 모델을 승격했습니다/);
  assert.match(markup, /6\.2%/);
  assert.match(markup, /0\.12%p/);
  assert.match(markup, /승격 쿨다운/);
  assert.match(markup, /14일/);
  assert.doesNotMatch(markup, /undefined|null|NaN/);
});

test('the decision panel keeps the badge, sentence, and metrics in one compact block', () => {
  const entry = createEntry();
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry] }),
  );

  assert.match(markup, /admin-decision__summary[^>]*><span class="status-tag status-tag--ok">승격<\/span>/);
  assert.equal(markup.match(/admin-decision__metric"/g)?.length, 3);
  assert.match(markup, /admin-decision__metric"[^>]*><span>MAE 개선<\/span>/);
  assert.match(markup, /<span>평가 후보<\/span><strong>225개<\/strong>/);
  assert.doesNotMatch(markup, /평가한 후보 조합 수/);
  // 승격 기준은 카드 폭을 차지하는 admin-panel 박스가 아니라 헤더의 토글이어야 한다.
  assert.doesNotMatch(markup, /<details class="admin-panel"/);
  assert.match(markup, /<details class="admin-thresholds">/);
});

test('admin diagnostics label unused indicators and missing metrics without fake numbers', () => {
  const entry = createEntry({
    params: MODEL_A_PARAMS,
    promoted: false,
    promotionReason: 'kept_current_model_improvement_below_minimum',
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
  });
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry] }),
  );

  assert.match(markup, /Dubai: 미사용/);
  assert.match(markup, /USD\/KRW: 미사용/);
  assert.match(markup, /승격 이력 없음/);
  assert.match(markup, /데이터 부족/);
  assert.match(markup, /비교 데이터 없음/);
  assert.match(markup, /Model A 유지/);
  assert.doesNotMatch(markup, /MAE: 0\.00원\/L/);
});

test('admin diagnostics fall back to an empty state without forecast runs', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: null, history: [] }),
  );

  assert.match(markup, /모델 선택 진단 기록이 없습니다/);
  assert.doesNotMatch(markup, /후보 모델 비교/);
});
