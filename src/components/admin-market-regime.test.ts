import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminMarketRegime } from './admin-market-regime';
import type {
  MarketRegime,
  MarketRegimeAnalysis,
  MarketRegimeSummary,
} from '@/lib/forecast/market-regime';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function summary(
  regime: MarketRegime,
  sampleCount: number,
  maeKrwPerL: number | null,
): MarketRegimeSummary {
  return {
    regime,
    sampleCount,
    maeKrwPerL,
    mapePct: maeKrwPerL === null ? null : maeKrwPerL / 18,
    rmseKrwPerL: maeKrwPerL === null ? null : maeKrwPerL + 2,
    medianAbsoluteErrorKrwPerL: maeKrwPerL,
    maxAbsoluteErrorKrwPerL: maeKrwPerL === null ? null : maeKrwPerL * 1.5,
    directionAccuracyRatio: maeKrwPerL === null ? null : 0.667,
    averageTrendDeltaKrwPerL: 2.4,
    averageDubaiContributionRatio: 0.012,
    averageUsdKrwContributionRatio: null,
    averageExternalAdjustmentRatio: 0.012,
    capReachedCount: 1,
  };
}

const ANALYSIS: MarketRegimeAnalysis = {
  version: 1,
  evaluatedAt: '2026-09-03T00:00:00.000Z',
  windowWeeks: 26,
  currentRegime: 'high-volatility',
  currentFeatures: {
    trend4wRatio: 0.028,
    volatility4wRatio: 0.014,
    trendMagnitudeThreshold: 0.004,
    highVolatilityThreshold: 0.006,
  },
  currentWeekEndDate: '2026-08-13T00:00:00.000Z',
  overall: {
    sampleCount: 20,
    maeKrwPerL: 24.2,
    mapePct: 1.31,
    rmseKrwPerL: 28.1,
    medianAbsoluteErrorKrwPerL: 21.4,
    maxAbsoluteErrorKrwPerL: 72.3,
    directionAccuracyRatio: 0.65,
  },
  regimes: [
    summary('stable', 8, 12.4),
    summary('rising', 2, 98.7),
    summary('falling', 5, 25.3),
    summary('high-volatility', 5, 47.8),
  ],
  largestErrors: [
    {
      originWeekEndDate: '2026-07-30T00:00:00.000Z',
      targetDate: '2026-08-06T00:00:00.000Z',
      regime: 'high-volatility',
      forecastKrwPerL: 1802,
      actualKrwPerL: 1849,
      signedErrorKrwPerL: -47,
      absoluteErrorKrwPerL: 47,
      directionHit: false,
    },
    {
      originWeekEndDate: '2026-06-11T00:00:00.000Z',
      targetDate: '2026-06-18T00:00:00.000Z',
      regime: 'falling',
      forecastKrwPerL: 1946,
      actualKrwPerL: 2004,
      signedErrorKrwPerL: -58,
      absoluteErrorKrwPerL: 58,
      directionHit: true,
    },
  ],
  weakestRegime: 'high-volatility',
};

function render(analysis: MarketRegimeAnalysis | null = ANALYSIS): string {
  return renderToStaticMarkup(createElement(AdminMarketRegime, { analysis }));
}

test('the card keeps a fixed regime order and always shows sample counts', () => {
  const markup = render();
  const rows = [...markup.matchAll(/data-label="국면">([^<]+)</g)].map((match) => match[1]);

  assert.deepEqual(rows.slice(0, 4), ['안정', '상승 추세', '하락 추세', '고변동']);
  assert.match(markup, /data-label="표본">8주/);
  assert.match(markup, /data-label="MAE">12\.40원\/L/);
  assert.match(markup, /최근 26주 1주 예측 기준/);
  assert.match(markup, /전체 MAE 24\.20원\/L \(표본 20주\)/);
});

test('a regime below the report sample count is marked instead of ranked', () => {
  const markup = render();

  assert.match(markup, /표본 부족/);
  assert.match(markup, /표본이 적어 국면 특성을 판단하기 어렵습니다/);
  assert.match(markup, /오차가 가장 컸던 국면/);
  assert.match(markup, /고변동 · 표본 5주 · MAE 47\.80원\/L · 최대 오차 71\.70원\/L/);
  assert.match(markup, /전체 대비 \+23\.60원\/L/);
});

test('the current market block reports the regime and its two features', () => {
  const markup = render();

  assert.match(markup, /현재: 고변동/);
  assert.match(markup, /최근 4주 변화<\/span><strong>\+2\.8%<\/strong>/);
  assert.match(markup, /최근 4주 변동성<\/span><strong>1\.4%<\/strong>/);
});

test('regime details stay collapsed and stay a reference, not a cause', () => {
  const markup = render();

  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /국면별 상세/);
  assert.match(markup, /8월 1주차/);
  assert.match(markup, /data-label="오차">-47\.00원\/L/);
  assert.match(markup, /적중/);
  assert.match(markup, /실패/);
  assert.match(markup, /함께 관측된 예측 구성 정보이며 오차 해석 참고용/);
  assert.match(markup, /Cap 도달<\/dt><dd>1회<\/dd>/);
  assert.match(markup, /공식 신뢰도 등급과 별도로/);
});

test('internal regime codes never reach the rendered markup', () => {
  const markup = render();

  assert.doesNotMatch(markup, /high-volatility|unclassified|walk-forward|quantile/);
});

test('a run without regime analysis renders the empty state', () => {
  const markup = render(null);

  assert.match(markup, /시장 국면별 분석 데이터가 없습니다/);
  assert.match(markup, /다음 예측 실행부터 국면별 성능 분석이 기록됩니다/);
  assert.doesNotMatch(markup, /<table/);
});

test('an unrated weakest regime explains the missing ranking', () => {
  const markup = render({ ...ANALYSIS, weakestRegime: null });

  assert.match(markup, /표본이 충분한 국면이 아직 없습니다/);
});
