import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminParameterSensitivity } from './admin-parameter-sensitivity';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import { buildParameterSensitivity } from '@/lib/forecast/parameter-sensitivity';
import type { RunWalkForwardBacktestResult } from '@/lib/forecast/run-walk-forward-backtest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const CURRENT: ForecastModelParams = {
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

function metrics(mae: number, overrides: Record<string, number | null> = {}) {
  return {
    windowWeeks: 13,
    sampleCount: 13,
    maeKrwPerL: mae,
    mapePct: mae / 18,
    rmseKrwPerL: mae + 2,
    medianAbsoluteErrorKrwPerL: mae - 2,
    maxAbsoluteErrorKrwPerL: mae * 2,
    directionAccuracyRatio: 0.62,
    forecastChurnKrwPerL: 5,
    ...overrides,
  };
}

function backtest(params: ForecastModelParams, mae: number): RunWalkForwardBacktestResult {
  return {
    params,
    recent: metrics(mae),
    long: metrics(mae + 1.7, { windowWeeks: 26 }),
    recentOneStep: metrics(mae),
    longOneStep: metrics(mae + 1.7, { windowWeeks: 26 }),
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [],
  };
}

function render(currentParams = CURRENT, betterTrendWeeks: number | null = 6) {
  const sensitivity = buildParameterSensitivity({
    currentParams,
    currentBacktest: backtest(currentParams, 22.8),
    evaluatedAt: new Date('2026-09-02T00:00:00.000Z'),
    evaluate: (params) =>
      backtest(params, params.trendLookbackWeeks === betterTrendWeeks ? 18.4 : 23.5),
  });

  return renderToStaticMarkup(createElement(AdminParameterSensitivity, { sensitivity }));
}

test('the card shows the operating parameters and one collapsed group per factor', () => {
  const markup = render();

  assert.match(markup, /파라미터 민감도 분석/);
  assert.match(markup, /분석 결과는 진단용이며 운영 모델에 자동 적용되지 않습니다/);
  assert.match(markup, /현재 모델<\/span><strong>Model B<\/strong>/);
  assert.match(markup, /Trend lookback<\/span><strong>8주<\/strong>/);
  assert.match(markup, /Dubai<\/span><strong>lag 1주 · weight 20\.0%<\/strong>/);
  assert.match(markup, /USD\/KRW<\/span><strong>미사용<\/strong>/);
  assert.match(markup, /외부 보정 Cap<\/span><strong>±3%<\/strong>/);
  assert.match(markup, /Trend lookback 민감도/);
  assert.match(markup, /Dubai 민감도/);
  assert.match(markup, /USD\/KRW 민감도/);
  assert.match(markup, /외부 보정 Cap 민감도/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
});

test('candidate rows mark the current setting and show the change against it', () => {
  const markup = render();

  assert.match(markup, /8주<span class="status-tag status-tag--ok">현재<\/span>/);
  assert.match(markup, /\(-4\.40\)/);
  assert.match(markup, /data-label="13주 MAE"/);
  assert.match(markup, /data-label="26주 MAE"/);
  assert.match(markup, /data-label="최대 오차"/);
  assert.match(markup, /data-label="방향 정확도"/);
});

test('tuning candidates are labelled as review items that are never applied automatically', () => {
  const markup = render();

  assert.match(markup, /튜닝 검토 후보/);
  assert.match(markup, /1\. Trend lookback 6주/);
  assert.match(markup, /13주 MAE 22\.80원\/L → 18\.40원\/L/);
  assert.match(markup, /기존 승격 품질 기준 충족/);
  assert.match(markup, /실제 적용 전 별도 Shadow 검증이 필요하며/);
  assert.doesNotMatch(markup, /추천 설정|적용 예정|자동 튜닝/);
  assert.doesNotMatch(markup, /<button/);
});

test('a model without Dubai reports that USD/KRW cannot be evaluated', () => {
  const markup = render({ ...CURRENT, modelId: 'A', dubai: null }, null);

  assert.match(markup, /USD\/KRW 민감도는 Dubai 보정을 사용하는 모델에서 평가할 수 있습니다/);
  assert.match(markup, /현재 테스트 범위에서 운영 설정보다 명확히 우수한 튜닝 후보가 없습니다/);
});

test('runs without stored sensitivity metadata fall back cleanly', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminParameterSensitivity, { sensitivity: null }),
  );

  assert.match(markup, /민감도 분석 데이터가 없습니다/);
  assert.match(markup, /다음 Forecast 실행부터 파라미터 비교 결과가 기록됩니다/);
  assert.doesNotMatch(markup, /<table/);
});
