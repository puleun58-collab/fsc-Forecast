import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AdminOperationsSummary,
  type AdminOperationsSummaryProps,
} from './admin-operations-summary';
import type { ModelTransitionView } from './admin-model-transition';
import type { PostTransitionView } from './admin-post-transition';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import type { PerformanceDrift } from '@/lib/forecast/performance-drift';
import type { ShadowValidationSession } from '@/lib/forecast/shadow-validation';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const PARAMS: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const TRANSITION: ModelTransitionView = {
  status: 'not-ready',
  blockReason: null,
  cooldownRemainingDays: 0,
  baselineParams: PARAMS,
  candidateParams: PARAMS,
  summary: null,
  approvedAt: null,
  appliedAt: null,
  request: null,
  history: [],
};

function shadowSession(
  observations: { targetDate: string; actual: number | null }[],
): ShadowValidationSession {
  return {
    version: 1,
    sessionId: 'session',
    status: 'validating',
    stoppedReason: null,
    startedAt: '2026-06-01T00:00:00.000Z',
    completedAt: null,
    baselineModelVersion: 'v1',
    baselineParams: PARAMS,
    candidateParams: { ...PARAMS, trendLookbackWeeks: 6 },
    candidateFingerprint: 'v1|B|6|1:0.2|none|0.03',
    candidateSource: 'parameter-sensitivity:trendLookback',
    requiredSampleCount: 13,
    observations: observations.map((observation, index) => ({
      originWeekEndDate: `2026-06-0${index + 1}T00:00:00.000Z`,
      targetDate: observation.targetDate,
      anchorKrwPerL: 1500,
      baselineForecastKrwPerL: 1520,
      shadowForecastKrwPerL: 1515,
      actualKrwPerL: observation.actual,
      baselineAbsoluteErrorKrwPerL: observation.actual === null ? null : Math.abs(1520 - observation.actual),
      shadowAbsoluteErrorKrwPerL: observation.actual === null ? null : Math.abs(1515 - observation.actual),
      baselineApePct: null,
      shadowApePct: null,
      baselineDirection: 'up' as const,
      shadowDirection: 'up' as const,
      actualDirection: observation.actual === null ? null : ('up' as const),
      issuedAt: '2026-06-01T00:00:00.000Z',
      resolvedAt: observation.actual === null ? null : '2026-06-08T00:00:00.000Z',
    })),
  };
}

function render(overrides: Partial<AdminOperationsSummaryProps> = {}): string {
  return renderToStaticMarkup(
    createElement(AdminOperationsSummary, {
      modelParams: PARAMS,
      recentMapePct: 1.47,
      recentMaeKrwPerL: 28.37,
      recentSampleCount: 13,
      reliabilityGrade: 'A',
      persistence: null,
      tuningCandidateCount: 0,
      shadow: null,
      transition: TRANSITION,
      postTransition: null,
      ...overrides,
    }),
  );
}

test('the summary leads with the operating model and its recent next-week performance', () => {
  const markup = render();

  assert.match(markup, /현재 Model B/);
  assert.match(markup, /최근 13주 MAPE<\/span><strong>1\.47%<\/strong>/);
  assert.match(markup, /최근 13주 MAE<\/span><strong>28\.37원\/L<\/strong>/);
  assert.match(markup, /평가 표본<\/span><strong>13주<\/strong>/);
  assert.match(markup, /신뢰도 등급<\/span><strong>A<\/strong>/);
  assert.match(markup, /Trend 8주 · Dubai 반영 시차 1주 · 반영 비중 20% · USD\/KRW 미사용/);
  assert.match(markup, /최근 13주의 다음 주 예측 결과를 기준으로 산정한 성능입니다/);
});

test('only one next step is shown and idle runs report no candidate', () => {
  const markup = render();
  const steps = markup.match(/class="admin-summary__next /g) ?? [];

  assert.equal(steps.length, 1);
  assert.match(markup, /튜닝 후보 없음/);
});

test('candidate confirmation and shadow progress are reported as the next step', () => {
  const confirming = render({
    tuningCandidateCount: 2,
    persistence: {
      version: 1,
      status: 'confirming',
      candidateFingerprint: 'v1|B|6|1:0.2|none|0.03',
      candidateParams: { ...PARAMS, trendLookbackWeeks: 6 },
      candidateSource: 'parameter-sensitivity:trendLookback',
      confirmedCount: 1,
      requiredCount: 2,
      lastConfirmedWeekEndDate: '2026-08-19T00:00:00.000Z',
      startedAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    },
  });
  const validating = render({
    shadow: shadowSession([
      { targetDate: '2026-06-08T00:00:00.000Z', actual: 1510 },
      { targetDate: '2026-06-15T00:00:00.000Z', actual: 1512 },
      { targetDate: '2026-06-22T00:00:00.000Z', actual: null },
    ]),
  });

  assert.match(confirming, /1순위 후보 확인 중 · 1\/2주/);
  assert.match(validating, /Shadow 검증 중 · 2\/13주/);
  assert.doesNotMatch(validating, /1순위 후보 확인 중/);
});

test('states that need an admin decision outrank progress states', () => {
  const approvable = render({
    transition: { ...TRANSITION, status: 'approvable' },
    shadow: shadowSession([{ targetDate: '2026-06-08T00:00:00.000Z', actual: 1510 }]),
  });
  const rollback = render({
    transition: { ...TRANSITION, status: 'approvable' },
    postTransition: {
      monitoring: {
        version: 1,
        sourceTransitionId: 'transition',
        modelVersion: 'v1',
        currentParams: PARAMS,
        rollbackParams: { ...PARAMS, trendLookbackWeeks: 6 },
        startedAt: '2026-06-01T00:00:00.000Z',
        status: 'rollback_reviewable',
        stoppedReason: null,
        requiredSampleCount: 13,
        observations: [],
      },
      summary: {
        status: 'rollback_reviewable',
        completedSampleCount: 13,
        pendingSampleCount: 0,
        requiredSampleCount: 13,
        current: {
          maeKrwPerL: 24,
          mapePct: 1.4,
          maxAbsoluteErrorKrwPerL: 70,
          directionAccuracyRatio: 0.6,
          forecastChurnKrwPerL: 5,
        },
        rollback: {
          maeKrwPerL: 18,
          mapePct: 1.0,
          maxAbsoluteErrorKrwPerL: 60,
          directionAccuracyRatio: 0.7,
          forecastChurnKrwPerL: 5,
        },
        qualityChecks: {
          maeImprovementRatio: 0.25,
          mapeImprovementPctPoint: 0.4,
          meetsMinimumImprovement: true,
          maxErrorStable: true,
          churnStable: true,
        },
      },
      rollbackApprovable: true,
      rollbackBlockedText: null,
      earlyWarningText: null,
      request: null,
    },
  });

  assert.match(approvable, /운영 전환 승인 필요/);
  assert.doesNotMatch(approvable, /Shadow 검증 중/);
  assert.match(rollback, /롤백 검토 필요/);
  assert.doesNotMatch(rollback, /운영 전환 승인 필요/);
});

test('a run without diagnostics renders the empty state', () => {
  const markup = render({ modelParams: null });

  assert.match(markup, /예측 실행 기록이 없습니다/);
  assert.doesNotMatch(markup, /admin-summary__next/);
});

function driftWindow(windowWeeks: number, mae: number, maxError = mae * 2) {
  return {
    windowWeeks,
    sampleCount: windowWeeks,
    maeKrwPerL: mae,
    mapePct: mae / 20,
    maxAbsoluteErrorKrwPerL: maxError,
    directionAccuracyRatio: 0.69,
  };
}

function drift(overrides: Partial<PerformanceDrift> = {}): PerformanceDrift {
  return {
    version: 1,
    evaluatedAt: '2026-06-01T00:00:00.000Z',
    status: 'stable',
    degradedWeekCount: 0,
    lastEvaluatedWeekEndDate: '2026-05-28T00:00:00.000Z',
    short: driftWindow(4, 22.4),
    medium: driftWindow(13, 28.4),
    long: driftWindow(26, 31.7),
    reasons: [],
    ...overrides,
  };
}

test('a stable performance state is summarized with the three windows', () => {
  const markup = render({ drift: drift() });

  assert.match(markup, /Forecast 성능 상태/);
  assert.match(markup, /안정/);
  assert.match(markup, /최근 4주 MAE<\/span><strong>22\.40원\/L/);
  assert.match(markup, /최근 26주 MAE<\/span><strong>31\.70원\/L/);
  assert.match(markup, /최근 4주 예측 오차가 최근 13주 수준과 비슷합니다/);
});

test('a repeated degradation states the next things to check', () => {
  const markup = render({
    drift: drift({
      status: 'alert',
      degradedWeekCount: 2,
      short: driftWindow(4, 42.1),
      reasons: ['recent-mae-up', 'repeated-degradation'],
    }),
  });

  assert.match(markup, /악화 감지/);
  assert.match(markup, /예측 오차 증가가 반복되고 있습니다/);
  assert.match(markup, /입력 데이터 상태 → 시장 국면 → 신호 기여도/);
  assert.doesNotMatch(markup, /<button/);
});

test('a single large miss and a direction drop are shown as side notes', () => {
  const markup = render({
    drift: drift({ reasons: ['single-large-error', 'direction-accuracy-down'] }),
  });

  assert.match(markup, /최근 4주에 단일 큰 오차가 있었습니다/);
  assert.match(markup, /최근 4주 방향 적중률이 낮아졌습니다/);
});

test('the window table stays collapsed and never claims an automatic action', () => {
  const markup = render({ drift: drift() });
  const detailStart = markup.indexOf('성능 변화 상세 보기');

  assert.ok(detailStart > 0);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /data-label="MAPE"/);
  assert.match(markup, /후보 순위·Shadow·운영 전환을 자동으로 바꾸지 않습니다/);
});

test('runs from before the feature keep the summary unchanged', () => {
  const markup = render();

  assert.doesNotMatch(markup, /Forecast 성능 상태/);
});
