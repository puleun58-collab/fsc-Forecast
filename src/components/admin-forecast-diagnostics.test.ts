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
        maeKrwPerL: 179.35,
        mapePct: 9.38,
        maxAbsoluteErrorKrwPerL: 267.5,
        forecastChurnKrwPerL: 15.2,
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
  assert.equal(markup.match(/admin-decision__metric"/g)?.length, 12);
  assert.match(markup, /admin-decision__metric"[^>]*><span>MAE 개선<\/span>/);
  assert.match(markup, /<span>평가 후보<\/span><strong>225개<\/strong>/);
  assert.doesNotMatch(markup, /평가한 후보 조합 수/);
  // 승격 기준은 카드 폭을 차지하는 admin-panel 박스가 아니라 헤더의 토글이어야 한다.
  assert.doesNotMatch(markup, /<details class="admin-panel admin-thresholds"/);
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
  const reliabilityStart = markup.indexOf('admin-panel admin-decision admin-reliability');
  const judgmentStart = markup.indexOf('<div class="admin-panel admin-decision">', reliabilityStart);
  const horizonStart = markup.indexOf('<details class="admin-panel admin-disclosure">');
  const horizonEnd = markup.indexOf('</details>', horizonStart);
  const candidatesStart = markup.indexOf('후보 모델 비교');
  const reliabilityBlock = markup.slice(reliabilityStart, judgmentStart);
  const horizonBlock = markup.slice(horizonStart, horizonEnd);

  assert.match(reliabilityBlock, /신뢰도 기준 · 최근 13주/);
  assert.match(reliabilityBlock, /신뢰도 산정에 사용하는 최근 13주 1주 ahead 성능입니다/);
  assert.match(reliabilityBlock, />C<\/span>/);
  assert.match(reliabilityBlock, /<span>MAPE<\/span><strong>1\.47%<\/strong>/);
  assert.match(reliabilityBlock, /<span>MAE<\/span><strong>28\.42원\/L<\/strong>/);
  assert.match(reliabilityBlock, /<span>평가 표본<\/span><strong>13주<\/strong>/);
  assert.doesNotMatch(reliabilityBlock, /9\.38%|179\.35원\/L/);

  assert.match(markup.slice(horizonStart, horizonStart + 60), /<details class="admin-panel admin-disclosure">/);
  assert.doesNotMatch(markup.slice(horizonStart, horizonStart + 80), /\sopen(?:=|>|\s)/);
  assert.match(horizonBlock, /전체 Horizon 성능 · 참고/);
  assert.match(horizonBlock, /<span>MAPE<\/span><strong>9\.38%<\/strong>/);
  assert.match(horizonBlock, /<span>MAE<\/span><strong>179\.35원\/L<\/strong>/);
  assert.match(
    horizonBlock,
    /1주부터 최대 13주 ahead 예측을 모두 포함한 통합 성능이며, 신뢰도 등급 산정에는 직접 사용하지 않습니다/,
  );
  assert.ok(reliabilityStart < judgmentStart);
  assert.ok(judgmentStart < horizonStart);
  assert.ok(horizonStart < candidatesStart);
  assert.doesNotMatch(markup, /최근 구간/);
});

test('a run without one-step diagnostics never substitutes the full-horizon metrics', () => {
  const entry = createEntry({ recentOneStep: null, longOneStep: null });
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: null }),
  );
  const reliabilityStart = markup.indexOf('admin-panel admin-decision admin-reliability');
  const judgmentStart = markup.indexOf('<div class="admin-panel admin-decision">', reliabilityStart);
  const reliabilityBlock = markup.slice(reliabilityStart, judgmentStart);

  assert.match(reliabilityBlock, /신뢰도 기준 성능 데이터 없음/);
  assert.match(reliabilityBlock, /등급 데이터 없음/);
  assert.doesNotMatch(reliabilityBlock, /9\.38%|179\.35원\/L/);
  assert.match(markup, /<span>MAPE<\/span><strong>9\.38%<\/strong>/);
  assert.match(markup, /<span>MAE<\/span><strong>179\.35원\/L<\/strong>/);
});

test('model selection history is compact, grouped by repeated outcome, and capped at three rows', () => {
  const kept = createEntry({ promoted: false, promotionReason: 'kept_current_model_is_best' });
  const promoted = createEntry();
  const history = [
    { ...kept, runId: 'run-a', completedAt: '2026-09-02T02:00:00.000Z' },
    { ...kept, runId: 'run-b', completedAt: '2026-09-02T05:00:00.000Z' },
    { ...kept, runId: 'run-c', completedAt: '2026-09-02T08:00:00.000Z' },
    { ...kept, runId: 'run-d', completedAt: '2026-09-01T02:00:00.000Z' },
    { ...promoted, runId: 'run-e', completedAt: '2026-08-31T02:00:00.000Z' },
    { ...kept, runId: 'run-f', completedAt: '2026-08-30T02:00:00.000Z' },
  ];
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: promoted, history, reliability: RELIABILITY }),
  );
  const historyStart = markup.indexOf('최근 모델 선택 이력');
  const disclosureStart = markup.indexOf('<details class="admin-disclosure admin-disclosure--inline">');
  const preview = markup.slice(historyStart, disclosureStart);
  const rest = markup.slice(disclosureStart);

  assert.doesNotMatch(markup, /최근 모델 변경 이력/);
  assert.ok(historyStart > 0 && disclosureStart > historyStart);
  assert.equal(preview.match(/class="model-history-row"/g)?.length, 3);
  assert.match(preview, /2026\.09\.02<\/span><strong class="model-history-row__result">Model C 유지 · 3회<\/strong>/);
  assert.match(preview, /2026\.09\.01<\/span><strong class="model-history-row__result">Model C 유지<\/strong>/);
  assert.match(preview, /2026\.08\.31<\/span><strong class="model-history-row__result">Model A → Model C 승격<\/strong>/);
  assert.equal(rest.match(/class="model-history-row"/g)?.length, 6);
  assert.match(rest, /<strong>전체 이력 6건<\/strong>/);
  assert.match(rest, /2026\.09\.02 11:00 KST/);
  assert.match(rest, /2026\.08\.30 11:00 KST/);
  assert.doesNotMatch(rest, /· 3회/);
  assert.match(rest, /<strong>전체 이력 6건<\/strong><span class="admin-disclosure__toggle" aria-hidden="true"><span class="admin-disclosure__toggle-closed">보기 ▾<\/span>/);
  assert.doesNotMatch(markup.slice(disclosureStart, disclosureStart + 70), /\sopen(?:=|>|\s)/);
});

test('grouped rows still expose every original run behind the disclosure', () => {
  const kept = createEntry({ promoted: false, promotionReason: 'kept_current_model_is_best' });
  const history = [
    { ...kept, runId: 'run-a', completedAt: '2026-09-02T02:00:00.000Z' },
    { ...kept, runId: 'run-b', completedAt: '2026-09-02T05:00:00.000Z' },
    { ...kept, runId: 'run-c', completedAt: '2026-09-02T08:00:00.000Z' },
    { ...kept, runId: 'run-d', completedAt: '2026-09-02T09:00:00.000Z' },
  ];
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: kept, history, reliability: RELIABILITY }),
  );
  const disclosureStart = markup.indexOf('<details class="admin-disclosure admin-disclosure--inline">');
  const preview = markup.slice(markup.indexOf('최근 모델 선택 이력'), disclosureStart);
  const rest = markup.slice(disclosureStart);

  assert.equal(preview.match(/class="model-history-row"/g)?.length, 1);
  assert.match(preview, /Model C 유지 · 4회/);
  assert.match(rest, /<strong>전체 이력 4건<\/strong>/);
  assert.equal(rest.match(/class="model-history-row"/g)?.length, 4);
  assert.match(rest, /2026\.09\.02 18:00 KST/);
});

test('three or fewer runs render without the extra disclosure', () => {
  const entry = createEntry();
  const markup = renderToStaticMarkup(
    createElement(AdminForecastDiagnostics, { latest: entry, history: [entry], reliability: RELIABILITY }),
  );

  assert.match(markup, /최근 모델 선택 이력/);
  assert.equal(markup.match(/class="model-history-row"/g)?.length, 1);
  assert.doesNotMatch(markup, /전체 이력/);
});
