import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminPostTransition, type PostTransitionView } from './admin-post-transition';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import type {
  PostTransitionMonitoring,
  PostTransitionSummary,
} from '@/lib/forecast/post-transition-monitoring';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const PREVIOUS: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

const CURRENT: ForecastModelParams = {
  ...PREVIOUS,
  trendLookbackWeeks: 6,
};

const MONITORING: PostTransitionMonitoring = {
  version: 1,
  sourceTransitionId: 'transition-1',
  modelVersion: 'weekly-anchor-trend-v2',
  currentParams: CURRENT,
  rollbackParams: PREVIOUS,
  startedAt: '2026-09-16T02:00:00.000Z',
  status: 'monitoring',
  stoppedReason: null,
  requiredSampleCount: 13,
  observations: [],
};

const METRICS = {
  maeKrwPerL: 31.2,
  mapePct: 1.71,
  directionAccuracyRatio: 0.538,
  maxAbsoluteErrorKrwPerL: 61.3,
  forecastChurnKrwPerL: 20.4,
};

function summary(status: PostTransitionSummary['status'], completedSampleCount: number): PostTransitionSummary {
  return {
    status,
    completedSampleCount,
    pendingSampleCount: 0,
    requiredSampleCount: 13,
    current: METRICS,
    rollback: {
      maeKrwPerL: 22.8,
      mapePct: 1.25,
      directionAccuracyRatio: 0.692,
      maxAbsoluteErrorKrwPerL: 42.1,
      forecastChurnKrwPerL: 17.8,
    },
    qualityChecks: {
      maeImprovementRatio: 0.269,
      mapeImprovementPctPoint: 0.46,
      meetsMinimumImprovement: true,
      maxErrorStable: true,
      churnStable: true,
    },
  };
}

function render(view: PostTransitionView | null): string {
  return renderToStaticMarkup(createElement(AdminPostTransition, { view }));
}

test('monitoring renders progress as interim evidence without a rollback action', () => {
  const markup = render({
    monitoring: MONITORING,
    summary: summary('monitoring', 4),
    rollbackApprovable: false,
    rollbackBlockedText: null,
    earlyWarningText: '최근 오차 추세 확인이 필요합니다.',
    request: null,
  });

  assert.match(markup, /모니터링 중 · 4\/13/);
  assert.match(markup, /표본 13주가 확보되기 전까지는 중간 결과/);
  assert.match(markup, /최근 오차 추세 확인이 필요합니다/);
  assert.match(markup, /현재/);
  assert.match(markup, /이전 설정/);
  assert.doesNotMatch(markup, /이전 설정으로 롤백 승인/);
  assert.match(markup, /자동으로 되돌리지 않습니다/);
  assert.match(markup, /<strong>전환 후 상세<\/strong>/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
});

test('a reviewable regression exposes rollback approval but never applies it automatically', () => {
  const markup = render({
    monitoring: { ...MONITORING, status: 'rollback_reviewable' },
    summary: summary('rollback_reviewable', 13),
    rollbackApprovable: true,
    rollbackBlockedText: null,
    earlyWarningText: null,
    request: {
      sourceTransitionId: 'transition-1',
      sourceForecastRunId: 'run-20',
      rollbackFingerprint: 'rollback-fingerprint',
    },
  });

  assert.match(markup, /롤백 검토 필요/);
  assert.match(markup, /이전 설정의 예측 오차가 더 작았습니다/);
  assert.match(markup, /31\.20원/);
  assert.match(markup, /22\.80원/);
  assert.match(markup, /이전 설정으로 롤백 승인/);
});

test('a blocked rollback shows the existing guardrail reason and no action', () => {
  const markup = render({
    monitoring: { ...MONITORING, status: 'rollback_reviewable' },
    summary: summary('rollback_reviewable', 13),
    rollbackApprovable: false,
    rollbackBlockedText: '기존 운영 변경 보호 기간이 남아 있어 지금은 롤백할 수 없습니다.',
    earlyWarningText: null,
    request: null,
  });

  assert.match(markup, /기존 운영 변경 보호 기간/);
  assert.doesNotMatch(markup, /<button[^>]*>이전 설정으로 롤백 승인/);
});

test('missing monitoring metadata renders no empty placeholder card', () => {
  assert.equal(render(null), '');
});
