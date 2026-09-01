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
      recentOneStep: { sampleCount: 13, maeKrwPerL: 28.42, mapePct: 1.47 },
      longOneStep: { sampleCount: 26, maeKrwPerL: 31.1, mapePct: 1.62 },
      ...overrides,
    },
  });

  assert.ok(diagnostics);
  return { runId: 'run-1', completedAt: '2026-08-18T02:00:00.000Z', diagnostics };
}

const RELIABILITY = {
  grade: 'C',
  sampleCount: 13,
  recent13wWeeklyPriceMae: 28.42,
  recent13wWeeklyPriceMape: 1.47,
};

test('admin diagnostics render the current model, parameters, and candidate comparison', () => {
  const entry = createEntry();
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: RELIABILITY }),
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
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: RELIABILITY }),
  );

  assert.match(markup, /admin-decision__summary[^>]*><span class="status-tag status-tag--ok">승격<\/span>/);
  assert.equal(markup.match(/admin-decision__metric"/g)?.length, 13);
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
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: null }),
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
    createElement(AdminForecastDiagnostics, { latest: null, history: [], reliability: null }),
  );

  assert.match(markup, /모델 선택 진단 기록이 없습니다/);
  assert.doesNotMatch(markup, /후보 모델 비교/);
});

test('performance blocks separate the reliability basis from the full-horizon basis', () => {
  const entry = createEntry();
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: RELIABILITY }),
  );

  assert.match(markup, /신뢰도 기준 성능 · 최근 13주 1주 ahead/);
  assert.match(markup, /전체 Horizon 성능 · 참고/);
  assert.match(markup, /<strong>28\.42원\/L<\/strong>/);
  assert.match(markup, /<strong>1\.47%<\/strong>/);
  assert.match(markup, /<span>신뢰도<\/span><strong>C<\/strong>/);
  assert.match(markup, /<strong>17\.05원\/L<\/strong>/);
  assert.match(markup, /<strong>0\.89%<\/strong>/);
  assert.match(markup, /1주부터 최대 13주 ahead 예측을 모두 포함한 성능입니다/);
  assert.doesNotMatch(markup, /최근 구간/);
});

test('a run without one-step diagnostics never substitutes the full-horizon metrics', () => {
  const entry = createEntry({ recentOneStep: null, longOneStep: null });
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: null }),
  );

  assert.match(markup, /이 실행에는 1주 기준 진단값이 저장되지 않았습니다/);
  assert.match(markup, /<strong>17\.05원\/L<\/strong>/);
  assert.doesNotMatch(markup, /<span>신뢰도<\/span>/);
});
