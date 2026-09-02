import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminForecastQualityTrend } from './admin-forecast-quality-trend';
import {
  buildForecastQualityTrend,
  type ForecastQualityResult,
} from '@/lib/forecast-quality-trend/forecast-quality-trend';
import {
  assessForecastQuality,
  type AssessForecastQualityInput,
} from '@/lib/fsc/forecast-quality-signal';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function result(overrides: Partial<ForecastQualityResult> = {}): ForecastQualityResult {
  return {
    id: 'fsc-1',
    createdAt: '2026-09-02T02:00:00.000Z',
    recent13wWeeklyPriceMape: 1.47,
    recent13wWeeklyPriceMae: 22.5,
    recent4wWeeklyPriceMae: 21.34,
    recent26wWeeklyPriceMae: 24.81,
    recent13wDirectionAccuracy: 0.692,
    forecastBias4w: 4.21,
    forecastBias13w: 3.15,
    ...overrides,
  };
}

const PREVIOUS = result({
  id: 'fsc-0',
  createdAt: '2026-09-01T02:00:00.000Z',
  recent13wWeeklyPriceMape: 1.59,
  recent4wWeeklyPriceMae: 23.48,
  recent26wWeeklyPriceMae: 23.96,
  recent13wDirectionAccuracy: 0.615,
  forecastBias4w: 5.53,
});

function assessment(overrides: Partial<AssessForecastQualityInput> = {}) {
  return assessForecastQuality({
    adjustmentReasons: [],
    reliabilityGrade: 'B',
    reliabilitySampleCount: 13,
    reliabilityMinimumSampleCount: 13,
    recent4wErrorTrend: 'stable',
    dataFreshnessStatus: 'fresh',
    hasReliabilityRecord: true,
    ...overrides,
  });
}

function render(
  results: readonly ForecastQualityResult[],
  overrides: Partial<AssessForecastQualityInput> = {},
) {
  return renderToStaticMarkup(
    createElement(AdminForecastQualityTrend, {
      trend: buildForecastQualityTrend(results, assessment(overrides)),
      errorAnalysis: null,
      backtestPoints: [],
    }),
  );
}

test('the trend card shows five metrics with their change against the previous run', () => {
  const markup = render([result(), PREVIOUS]);

  assert.match(markup, /예측 품질 추이/);
  assert.match(markup, /<span class="status-tag status-tag--ok">안정<\/span>/);
  assert.match(markup, /최근 13주 MAPE<\/span><strong>1\.47%<\/strong>/);
  assert.match(markup, /최근 4주 MAE<\/span><strong>21\.34원\/L<\/strong>/);
  assert.match(markup, /최근 26주 MAE<\/span><strong>24\.81원\/L<\/strong>/);
  assert.match(markup, /방향 정확도<\/span><strong>69\.2%<\/strong>/);
  assert.match(markup, /최근 Bias<\/span><strong>\+4\.21원\/L<\/strong>/);
  assert.match(markup, /↓ 0\.12%p <span class="quality-trend-metric__scope">직전 실행 <\/span>대비 개선/);
  assert.match(markup, /↓ 2\.14원\/L <span class="quality-trend-metric__scope">직전 실행 <\/span>대비 개선/);
  assert.match(markup, /↑ 0\.85원\/L <span class="quality-trend-metric__scope">직전 실행 <\/span>대비 악화/);
  assert.match(markup, /↑ 7\.7%p <span class="quality-trend-metric__scope">직전 실행 <\/span>대비 개선/);
  assert.match(markup, /↓ 1\.32원\/L <span class="quality-trend-metric__scope">직전 실행 <\/span>대비 개선/);
});

test('direction words accompany every arrow so colour is never the only cue', () => {
  const markup = render([result(), PREVIOUS]);
  const deltas = [...markup.matchAll(/quality-trend-metric__delta">([^<]*(?:<[^>]+>[^<]*)*?)<\/span><\/div>/g)]
    .map((match) => (match[1] ?? '').replace(/<[^>]+>/g, ''))
    .filter((text) => text.includes('↓') || text.includes('↑'));

  assert.equal(deltas.length > 0, true);
  assert.equal(
    deltas.every((text) => text.includes('대비 개선') || text.includes('대비 악화')),
    true,
  );
});

test('a run without a comparable previous result explains the missing comparison', () => {
  const markup = render([result()]);
  const metricsStart = markup.indexOf('quality-trend-metrics');
  const metricsBlock = markup.slice(metricsStart, markup.indexOf('quality-trend-chart'));

  assert.match(markup, /비교 데이터 없음/);
  assert.match(markup, /추이 데이터가 아직 충분하지 않습니다/);
  assert.doesNotMatch(metricsBlock, /개선|악화|유지/);
});

test('missing metrics read as pending instead of zero', () => {
  const markup = render([
    result({ recent4wWeeklyPriceMae: null, forecastBias4w: null }),
    PREVIOUS,
  ]);

  assert.match(markup, /최근 4주 MAE<\/span><strong>산정 전<\/strong>/);
  assert.match(markup, /최근 Bias<\/span><strong>산정 전<\/strong>/);
  assert.match(markup, /최근 13주 MAPE<\/span><strong>1\.47%<\/strong>/);
});

test('the chart renders one point per run with an accessible summary', () => {
  const markup = render([
    result({ createdAt: '2026-09-03T02:00:00.000Z', recent13wWeeklyPriceMape: 1.41 }),
    result({ createdAt: '2026-09-02T02:00:00.000Z', recent13wWeeklyPriceMape: 1.47 }),
    result({ createdAt: '2026-09-01T02:00:00.000Z', recent13wWeeklyPriceMape: 1.59 }),
  ]);

  assert.match(markup, /최근 13주 MAPE 추이 · 최근 3회 실행/);
  assert.equal(markup.match(/class="quality-trend-chart__point"/g)?.length, 3);
  assert.match(markup, /aria-label="최근 13주 MAPE 추이, 2026\.09\.01 1\.59%부터 2026\.09\.03 1\.41%까지"/);
  assert.match(markup, /2026\.09\.01 1\.59% → 2026\.09\.03 1\.41%/);
});

test('a quarter without any quality metric falls back to the empty state', () => {
  const markup = render([
    result({
      recent13wWeeklyPriceMape: null,
      recent13wWeeklyPriceMae: null,
      recent4wWeeklyPriceMae: null,
      recent26wWeeklyPriceMae: null,
      recent13wDirectionAccuracy: null,
      forecastBias4w: null,
      forecastBias13w: null,
    }),
  ]);

  assert.match(markup, /아직 품질 지표가 없습니다/);
  assert.match(markup, /FSC 재계산이 실행되면 최근 13주 MAPE와 오차 지표가 표시됩니다/);
  assert.doesNotMatch(markup, /quality-trend-chart/);
});

test('a stable assessment reports no degradation signal', () => {
  const markup = render([result(), PREVIOUS]);

  assert.match(markup, /<span class="status-tag status-tag--ok">안정<\/span>/);
  assert.match(markup, /최근 예측 품질에 유의할 만한 악화 신호가 없습니다/);
  assert.doesNotMatch(markup, /quality-trend-status__reasons/);
  assert.doesNotMatch(markup, /데이터 확인 필요/);
});

test('recorded guardrail signals raise one attention badge with compact reasons', () => {
  const markup = render([result(), PREVIOUS], {
    adjustmentReasons: ['recent_4w_error_worsening', 'long_window_instability'],
    recent4wErrorTrend: 'worsening',
  });

  assert.equal(markup.match(/class="status-tag status-tag--warning">주의</g)?.length, 1);
  assert.match(markup, /최근 백테스트에서 품질 확인이 필요한 신호가 있습니다/);
  assert.equal(markup.match(/<li>/g)?.length, 2);
  assert.match(markup, /<li>최근 4주 오차 추세 주의<\/li>/);
  assert.match(markup, /<li>장기 안정성 주의<\/li>/);
  assert.doesNotMatch(markup, /최근 단기 오차 변동성이 커져/);
  assert.doesNotMatch(markup, /recent_4w_error_worsening|long_window_instability/);
});

test('unchanged metrics with an active guardrail explain the different comparison bases', () => {
  const unchanged = result();
  const markup = render([unchanged, { ...unchanged, id: 'fsc-0', createdAt: '2026-09-01T02:00:00.000Z' }], {
    adjustmentReasons: ['recent_4w_error_worsening'],
    recent4wErrorTrend: 'worsening',
  });

  assert.match(markup, /<span class="status-tag status-tag--warning">주의<\/span>/);
  assert.match(markup, /현재 품질 지표는 직전 실행과 큰 변화가 없습니다\. 다만 백테스트에서 품질 확인 신호가 유지되고 있습니다/);
  assert.match(markup, /<li>최근 4주 오차 추세 주의<\/li>/);
  assert.equal(markup.match(/직전 실행 <\/span>대비 유지/g)?.length, 7);
  assert.match(
    markup,
    /상단 상태는 직전 실행 대비 변화가 아니라 최근 백테스트 및 신뢰도 guardrail을 기준으로 표시합니다/,
  );
});

test('unchanged metrics without guardrails stay stable', () => {
  const unchanged = result();
  const markup = render([unchanged, { ...unchanged, id: 'fsc-0', createdAt: '2026-09-01T02:00:00.000Z' }]);

  assert.match(markup, /<span class="status-tag status-tag--ok">안정<\/span>/);
  assert.match(markup, /최근 예측 품질에 유의할 만한 악화 신호가 없습니다/);
  assert.match(markup, /직전 실행 <\/span>대비 유지/);
});

test('worsening metrics with a guardrail keep both signals visible', () => {
  const markup = render([result({ recent13wWeeklyPriceMape: 1.82 }), PREVIOUS], {
    adjustmentReasons: ['recent_4w_error_worsening'],
    recent4wErrorTrend: 'worsening',
  });

  assert.match(markup, /<span class="status-tag status-tag--warning">주의<\/span>/);
  assert.match(markup, /최근 백테스트에서 품질 확인이 필요한 신호가 있습니다/);
  assert.match(markup, /↑ 0\.23%p <span class="quality-trend-metric__scope">직전 실행 <\/span>대비 악화/);
});

test('delayed data is a separate notice rather than a quality warning', () => {
  const markup = render([result(), PREVIOUS], {
    adjustmentReasons: ['data_delayed'],
    dataFreshnessStatus: 'delayed',
  });

  assert.match(markup, /<span class="status-tag status-tag--ok">안정<\/span>/);
  assert.match(markup, /데이터 확인 필요/);
  assert.match(markup, /최신 데이터 수집이 지연되어 품질 판단 결과가 최신 상태가 아닐 수 있습니다/);
  assert.doesNotMatch(markup, /주의<\/span>/);
});

test('an insufficient sample count stays unrated instead of attention', () => {
  const markup = render([result(), PREVIOUS], {
    reliabilitySampleCount: 8,
    adjustmentReasons: ['recent_4w_error_worsening'],
  });

  assert.match(markup, /<span class="status-tag">산정 전<\/span>/);
  assert.match(markup, /예측 품질을 판단할 데이터가 아직 충분하지 않습니다/);
  assert.doesNotMatch(markup, /주의<\/span>/);
  assert.match(markup, /표본<\/dt><dd>8 \/ 13<\/dd>/);
});

test('the judgement basis stays collapsed and uses the shared toggle wording', () => {
  const markup = render([result(), PREVIOUS], {
    adjustmentReasons: ['long_window_caution'],
  });
  const basisStart = markup.indexOf('판단 근거');

  assert.ok(basisStart > 0);
  assert.match(markup.slice(basisStart), /보기 ▾/);
  assert.match(markup, /최근 오차 추세<\/dt><dd>안정<\/dd>/);
  assert.match(markup, /장기 안정성<\/dt><dd>주의<\/dd>/);
  assert.match(markup, /데이터 최신성<\/dt><dd>최신<\/dd>/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
});

test('supporting metrics stay behind a collapsed disclosure', () => {
  const markup = render([result(), PREVIOUS]);
  const disclosureStart = markup.indexOf('<details class="admin-panel admin-disclosure">');
  const preview = markup.slice(0, disclosureStart);

  assert.ok(disclosureStart > 0);
  assert.doesNotMatch(markup.slice(disclosureStart, disclosureStart + 60), /\sopen(?:=|>|\s)/);
  assert.match(markup.slice(disclosureStart), /<strong>보조 지표<\/strong>/);
  assert.match(markup.slice(disclosureStart), /최근 13주 MAE/);
  assert.match(markup.slice(disclosureStart), /13주 Bias/);
  assert.doesNotMatch(preview, /13주 Bias/);
});
