import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminModelTransition, type ModelTransitionView } from './admin-model-transition';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import type { ShadowValidationSummary } from '@/lib/forecast/shadow-validation';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const BASELINE: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const CANDIDATE: ForecastModelParams = {
  ...BASELINE,
  trendLookbackWeeks: 6,
  dubai: { lagWeeks: 2, weight: 0.15 },
};

const SUMMARY: ShadowValidationSummary = {
  status: 'reviewable',
  completedSampleCount: 13,
  pendingSampleCount: 0,
  requiredSampleCount: 13,
  baseline: {
    maeKrwPerL: 24.8,
    mapePct: 1.36,
    directionAccuracyRatio: 0.615,
    maxAbsoluteErrorKrwPerL: 76.9,
    forecastChurnKrwPerL: 18.9,
  },
  shadow: {
    maeKrwPerL: 18.9,
    mapePct: 1.04,
    directionAccuracyRatio: 0.769,
    maxAbsoluteErrorKrwPerL: 61.5,
    forecastChurnKrwPerL: 15.2,
  },
  qualityChecks: {
    maeImprovementRatio: 0.238,
    mapeImprovementPctPoint: 0.32,
    meetsMinimumImprovement: true,
    maxErrorStable: true,
    churnStable: true,
  },
};

function view(overrides: Partial<ModelTransitionView> = {}): ModelTransitionView {
  return {
    status: 'approvable',
    blockReason: null,
    cooldownRemainingDays: 0,
    baselineParams: BASELINE,
    candidateParams: CANDIDATE,
    summary: SUMMARY,
    approvedAt: null,
    appliedAt: null,
    request: {
      shadowSessionId: 'shadow-1',
      candidateFingerprint: 'candidate-fingerprint',
      sourceForecastRunId: 'run-1',
    },
    history: [],
    ...overrides,
  };
}

function render(modelView: ModelTransitionView): string {
  return renderToStaticMarkup(createElement(AdminModelTransition, { view: modelView }));
}

test('a reviewable shadow result exposes one explicit admin approval action', () => {
  const markup = render(view());

  assert.match(markup, /운영 전환 검토/);
  assert.match(markup, /전환 가능/);
  assert.match(markup, /<dt>Trend<\/dt><dd>8주 → 6주<\/dd>/);
  assert.match(markup, /<dt>Dubai 반영 시차<\/dt><dd>1주 → 2주<\/dd>/);
  assert.match(markup, /<dt>Dubai 반영 비중<\/dt><dd>20% → 15%<\/dd>/);
  assert.match(markup, /<dt>USD\/KRW<\/dt><dd>동일<\/dd>/);
  assert.match(markup, /24\.80원/);
  assert.match(markup, /18\.90원/);
  assert.match(markup, /운영 전환 승인/);
  assert.doesNotMatch(markup, /전환 승인 취소|롤백 승인/);
  assert.match(markup, /다음 예측 성공 실행부터 새 설정이 사용됩니다/);
});

test('an approved transition stays pending and can be cancelled before application', () => {
  const markup = render(
    view({
      status: 'approved-pending',
      summary: null,
      approvedAt: '2026-09-02T09:00:00.000Z',
      request: null,
    }),
  );

  assert.match(markup, /승인 완료/);
  assert.match(markup, /다음 예측 실행 대기/);
  assert.match(markup, /전환 승인 취소/);
  assert.doesNotMatch(markup, />운영 전환 승인</);
});

test('a blocked transition explains the reused guardrail and does not render an action', () => {
  const markup = render(
    view({
      status: 'blocked',
      blockReason: 'cooldown_active',
      cooldownRemainingDays: 4,
      request: null,
    }),
  );

  assert.match(markup, /기존 운영 변경 보호 기간/);
  assert.match(markup, /4일 남았습니다/);
  assert.doesNotMatch(markup, /<button[^>]*>운영 전환 승인/);
});

test('transition history distinguishes an applied approval from a rollback', () => {
  const markup = render(
    view({
      status: 'applied',
      summary: null,
      request: null,
      appliedAt: '2026-09-16T02:00:00.000Z',
      history: [
        {
          approvedAt: '2026-09-15T02:00:00.000Z',
          appliedAt: '2026-09-16T02:00:00.000Z',
          sourceKind: 'shadow_admin_approved',
          status: 'applied',
          baselineParams: BASELINE,
          candidateParams: CANDIDATE,
        },
        {
          approvedAt: '2026-12-20T02:00:00.000Z',
          appliedAt: null,
          sourceKind: 'post_transition_rollback',
          status: 'approved_pending',
          baselineParams: CANDIDATE,
          candidateParams: BASELINE,
        },
      ],
    }),
  );

  assert.match(markup, /최근 운영 전환 이력/);
  assert.match(markup, /검증 후 관리자 승인 · 적용 완료/);
  assert.match(markup, /전환 후 성능 확인에 따른 이전 설정 복원 · 적용 대기/);
});
