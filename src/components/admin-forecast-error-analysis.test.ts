import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminForecastErrorAnalysis } from './admin-forecast-error-analysis';
import {
  buildForecastErrorAnalysis,
  type ForecastErrorAnalysis,
} from '@/lib/forecast/forecast-error-analysis';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import type { WalkForwardEvaluationPoint } from '@/lib/forecast/run-walk-forward-backtest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const PARAMS: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.02,
};

function point(overrides: Partial<WalkForwardEvaluationPoint> = {}): WalkForwardEvaluationPoint {
  return {
    originWeekEndDate: new Date('2026-08-07T00:00:00.000Z'),
    targetDate: new Date('2026-08-14T00:00:00.000Z'),
    horizonIndex: 1,
    anchorKrwPerL: 1860,
    actualKrwPerL: 1870.21,
    forecastKrwPerL: 1832.4,
    absoluteErrorKrwPerL: 37.81,
    absolutePercentageErrorPct: 2.02,
    actualDirection: 'up',
    forecastDirection: 'down',
    trendDeltaKrwPerL: -20,
    dubaiContributionRatio: -0.004,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: -0.004,
    externalAdjustmentRatio: -0.004,
    externalAdjustmentCapReached: false,
    ...overrides,
  };
}

function analysis(): ForecastErrorAnalysis {
  return buildForecastErrorAnalysis({
    selectedModelId: 'B',
    selectedParams: PARAMS,
    selectedBacktest: { oneStepPoints: [point()] },
    candidateBacktestsByModelId: {
      A: {
        oneStepPoints: [point({ forecastKrwPerL: 1852.01, absoluteErrorKrwPerL: 18.2 })],
      },
      B: { oneStepPoints: [point()] },
      C: null,
    },
  });
}

test('the analysis card stays collapsed and separates factor impact from the model comparison', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminForecastErrorAnalysis, { analysis: analysis() }),
  );

  assert.match(markup, /오차 원인 분석 · 최근 13주/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /주간 Trend/);
  assert.match(markup, /Dubai 보정/);
  assert.match(markup, /USD\/KRW 보정<\/span><strong>미사용<\/strong>/);
  assert.match(markup, /Model A/);
  assert.match(markup, /Model B/);
  assert.match(markup, /<span class="status-tag status-tag--ok">현재<\/span>/);
  assert.match(markup, /오차가 컸던 주차/);
});

test('each factor reports whether removing it would have reduced the error', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminForecastErrorAnalysis, { analysis: analysis() }),
  );

  assert.match(markup, /오차 [\d,.]+원\/L 확대/);
  assert.match(markup, /data-label="제거 시 Forecast"/);
  assert.match(markup, /data-label="오차 영향"/);
  assert.match(markup, /요소별 영향의 단순 합이\s+전체 오차와 같지는 않습니다/);
  assert.doesNotMatch(markup, /때문에 실제 경유가/);
});

test('the week summary names the most accurate model without changing anything', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminForecastErrorAnalysis, { analysis: analysis() }),
  );

  assert.match(markup, /동일 시점에서는 Model A의 오차가 가장 작았습니다/);
  assert.match(markup, /모델 파라미터는 이 분석으로 변경되지 않습니다/);
});

test('runs without analysis metadata fall back without breaking the card', () => {
  const markup = renderToStaticMarkup(createElement(AdminForecastErrorAnalysis, { analysis: null }));

  assert.match(markup, /오차 원인 분석 데이터가 없습니다/);
  assert.match(markup, /다음 Forecast 실행부터 상세 분석이 기록됩니다/);
  assert.doesNotMatch(markup, /<table/);
});
