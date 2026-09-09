import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AdminOperationsSummary,
  type AdminOperationsSummaryProps,
  type NextStepInput,
  resolveNextStep,
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
  assert.match(markup, /추세 기간 8주 · Dubai · 반영 시차 1주 · 비중 20% · USD\/KRW · 미사용/);
  assert.match(markup, /최근 13주의 다음 주 예측 결과를 기준으로 산정한 성능입니다/);
});

test('the summary drops progress state and keeps only the operating setting', () => {
  const markup = render();

  assert.match(markup, /현재 운영 중인 예측 설정과 최근 성능을 한눈에 보여줍니다/);
  assert.match(markup, /현재 운영 중인 설정입니다/);
  assert.doesNotMatch(markup, /admin-summary__next/);
  assert.doesNotMatch(markup, /1순위 후보 연속 확인|Shadow 검증을 시작|다음 확인 단계/);
});

function nextStep(overrides: Partial<NextStepInput> = {}) {
  return resolveNextStep({
    persistence: null,
    tuningCandidateCount: 0,
    shadow: null,
    transition: TRANSITION,
    postTransition: null,
    ...overrides,
  });
}

test('candidate confirmation and shadow progress are reported as the next step', () => {
  const confirming = nextStep({
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
  const validating = nextStep({
    shadow: shadowSession([
      { targetDate: '2026-06-08T00:00:00.000Z', actual: 1510 },
      { targetDate: '2026-06-15T00:00:00.000Z', actual: 1512 },
      { targetDate: '2026-06-22T00:00:00.000Z', actual: null },
    ]),
  });

  assert.equal(nextStep().label, '튜닝 후보 없음');
  assert.equal(confirming.label, '1순위 후보 연속 확인 1/2주');
  assert.equal(validating.label, 'Shadow 검증 중 · 2/13주');

  const confirmed = nextStep({
    tuningCandidateCount: 2,
    persistence: {
      version: 1,
      status: 'confirmed',
      candidateFingerprint: 'v1|B|6|1:0.2|none|0.03',
      candidateParams: { ...PARAMS, trendLookbackWeeks: 6 },
      candidateSource: 'parameter-sensitivity:trendLookback',
      confirmedCount: 2,
      requiredCount: 2,
      lastConfirmedWeekEndDate: '2026-08-26T00:00:00.000Z',
      startedAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    },
  });

  assert.equal(confirmed.label, '1순위 후보 연속 확인 2/2주');
  assert.equal(confirming.detail, '같은 후보가 다음 주에도 1순위를 유지하면 Shadow 검증을 시작합니다.');
});

test('states that need an admin decision outrank progress states', () => {
  const approvable = nextStep({
    transition: { ...TRANSITION, status: 'approvable' },
    shadow: shadowSession([{ targetDate: '2026-06-08T00:00:00.000Z', actual: 1510 }]),
  });
  const rollback = nextStep({
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

  assert.equal(approvable.label, '운영 전환 승인 필요');
  assert.equal(rollback.label, '롤백 검토 필요');
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

test('performance status stays compact without repeating quality trend detail', () => {
  const markup = render({ drift: drift() });

  assert.match(markup, /Forecast 성능 상태/);
  assert.match(markup, /안정/);
  assert.match(markup, /최근 Forecast 성능이 기준 범위 안에서 유지되고 있습니다/);
  assert.doesNotMatch(markup, /최근 4주 MAE|최근 26주 MAE/);
  assert.doesNotMatch(markup, /성능 변화 상세 보기|performance-drift-table/);
});

test('a repeated degradation keeps only the current performance state', () => {
  const markup = render({
    drift: drift({
      status: 'alert',
      degradedWeekCount: 2,
      short: driftWindow(4, 42.1),
      reasons: ['recent-mae-up', 'repeated-degradation'],
    }),
  });

  assert.match(markup, /악화 감지/);
  assert.match(markup, /최근 예측 오차 증가가 반복되었습니다/);
  assert.doesNotMatch(markup, /입력 데이터 상태 → 시장 국면 → 신호 기여도/);
  assert.doesNotMatch(markup, /data-label="MAPE"/);
});

test('runs from before the feature keep the summary unchanged', () => {
  const markup = render();

  assert.doesNotMatch(markup, /Forecast 성능 상태/);
});
