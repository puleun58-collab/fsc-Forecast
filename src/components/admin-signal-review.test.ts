import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminSignalReview } from './admin-signal-review';
import type { ForecastSignalContribution } from '@/lib/forecast/signal-contribution';
import type { SignalForwardValidation } from '@/lib/forecast/signal-forward-validation';
import type { SignalReviewDecision } from '@/lib/forecast/signal-review';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const CONTRIBUTION: ForecastSignalContribution = {
  version: 1,
  evaluatedAt: '2026-04-01T00:00:00.000Z',
  recentWindowWeeks: 13,
  longWindowWeeks: 26,
  signals: [
    { signal: 'trend', status: 'not-separable', recent: null, long: null },
    {
      signal: 'dubai',
      status: 'helpful',
      recent: {
        windowWeeks: 13,
        sampleCount: 13,
        baselineMaeKrwPerL: 17.17,
        ablatedMaeKrwPerL: 20.57,
        maeContributionKrwPerL: 3.4,
        baselineMapePct: 0.9,
        ablatedMapePct: 1.08,
        mapeContributionPctPoint: 0.18,
      },
      long: {
        windowWeeks: 26,
        sampleCount: 24,
        baselineMaeKrwPerL: 18.4,
        ablatedMaeKrwPerL: 20.5,
        maeContributionKrwPerL: 2.1,
        baselineMapePct: 0.95,
        ablatedMapePct: 1.05,
        mapeContributionPctPoint: 0.1,
      },
    },
    {
      signal: 'dailySignal',
      status: 'harmful',
      recent: {
        windowWeeks: 13,
        sampleCount: 13,
        baselineMaeKrwPerL: 19.8,
        ablatedMaeKrwPerL: 17.1,
        maeContributionKrwPerL: -2.7,
        baselineMapePct: 1.02,
        ablatedMapePct: 0.93,
        mapeContributionPctPoint: -0.09,
      },
      long: {
        windowWeeks: 26,
        sampleCount: 22,
        baselineMaeKrwPerL: 19.1,
        ablatedMaeKrwPerL: 17.2,
        maeContributionKrwPerL: -1.9,
        baselineMapePct: 1,
        ablatedMapePct: 0.94,
        mapeContributionPctPoint: -0.06,
      },
    },
  ],
};

const FORWARD: SignalForwardValidation = {
  version: 1,
  sessions: [
    {
      signal: 'dubai',
      baselineFingerprint: 'fingerprint',
      startedAt: '2026-01-08T00:00:00.000Z',
      observations: Array.from({ length: 4 }, (_, index) => ({
        originWeekEndDate: `2026-01-${String(8 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
        targetDate: `2026-01-${String(15 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
        issuedAt: `2026-01-${String(8 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
        baselineForecastKrwPerL: 1990,
        ablatedForecastKrwPerL: 1975,
        actualKrwPerL: 1995,
      })),
    },
  ],
};

const REVIEW: SignalReviewDecision[] = [
  {
    signal: 'dubai',
    status: 'keep',
    backtestVerdict: 'helpful',
    forwardVerdict: 'improved',
    forwardSampleCount: 13,
    forwardRequiredSampleCount: 13,
    dataQualityStatus: 'healthy',
    reasons: ['backtest-helpful', 'forward-helpful'],
  },
  {
    signal: 'dailySignal',
    status: 'review-removal',
    backtestVerdict: 'harmful',
    forwardVerdict: 'worsened',
    forwardSampleCount: 13,
    forwardRequiredSampleCount: 13,
    dataQualityStatus: 'healthy',
    reasons: ['backtest-harmful', 'forward-harmful'],
  },
];

function render(overrides: Partial<Parameters<typeof AdminSignalReview>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(AdminSignalReview, {
      contribution: CONTRIBUTION,
      forwardValidation: FORWARD,
      review: REVIEW,
      ...overrides,
    }),
  );
}

test('contribution is written as improvement or drag, never as a bare sign', () => {
  const markup = render();

  assert.match(markup, /예측 신호 기여도/);
  assert.match(markup, /최근 13주 · MAE 3\.40원\/L 개선 기여/);
  assert.match(markup, /최근 26주 · MAE 2\.10원\/L 개선 기여/);
  assert.match(markup, /MAE 2\.70원\/L 악화 가능성/);
  assert.doesNotMatch(markup, /\+3\.4<|-2\.7</);
});

test('trend reports that it cannot be removed on its own', () => {
  const markup = render();

  assert.match(markup, /추세<\/strong><span class="status-tag">구조상 독립 제거 비교 불가/);
  assert.doesNotMatch(markup, /Trend<|Bias 보정/);
});

test('the detail stays collapsed and keeps both windows with their samples', () => {
  const markup = render();
  const detailStart = markup.indexOf('상세 보기');

  assert.ok(detailStart > 0);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /최근 13주 · 비교 가능 13주/);
  assert.match(markup, /최근 26주 · 비교 가능 24주/);
  assert.match(markup, /현재 17\.17원\/L → 제거 20\.57원\/L/);
  assert.match(markup, /MAPE 0\.18%p 개선 기여/);
});

test('forward validation reports progress instead of a verdict before 13 weeks', () => {
  const markup = render();

  assert.match(markup, /실전 신호 검증/);
  assert.match(markup, /검증 중 · 4\/13주/);
  assert.doesNotMatch(markup, /실전 개선 확인 · 4\/13주/);
});

test('the review verdict shows both sides and the next tuning step', () => {
  const markup = render();

  assert.match(markup, /신호 운영 검토/);
  assert.match(markup, /유지 권장/);
  assert.match(markup, /축소·제거 검토/);
  assert.match(markup, /다음 단계 · 미사용·축소 설정을 기존 튜닝 후보 비교에서 확인합니다/);
  assert.match(markup, /신호를 자동으로 끄거나 운영 파라미터를 바꾸지 않습니다/);
});

test('runs from before the feature render the empty state', () => {
  const markup = render({ contribution: null, forwardValidation: null, review: [] });

  assert.match(markup, /신호 기여도 분석 이력이 없습니다/);
  assert.doesNotMatch(markup, /<table/);
});
