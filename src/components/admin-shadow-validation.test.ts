import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminShadowValidation } from './admin-shadow-validation';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import {
  SHADOW_REQUIRED_SAMPLE_COUNT,
  type ShadowObservation,
  type ShadowValidationSession,
} from '@/lib/forecast/shadow-validation';

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

function observation(index: number, baselineError: number, shadowError: number): ShadowObservation {
  const actualKrwPerL = 1800;

  return {
    originWeekEndDate: new Date(Date.UTC(2026, 8, 4 + (index - 1) * 7)).toISOString(),
    targetDate: new Date(Date.UTC(2026, 8, 4 + index * 7)).toISOString(),
    issuedAt: new Date(Date.UTC(2026, 8, 4 + (index - 1) * 7)).toISOString(),
    anchorKrwPerL: 1790,
    baselineForecastKrwPerL: actualKrwPerL + baselineError,
    shadowForecastKrwPerL: actualKrwPerL + shadowError,
    actualKrwPerL,
    baselineAbsoluteErrorKrwPerL: Math.abs(baselineError),
    shadowAbsoluteErrorKrwPerL: Math.abs(shadowError),
    baselineApePct: (Math.abs(baselineError) / actualKrwPerL) * 100,
    shadowApePct: (Math.abs(shadowError) / actualKrwPerL) * 100,
    baselineDirection: 'up',
    shadowDirection: 'up',
    actualDirection: 'up',
  };
}

function session(overrides: Partial<ShadowValidationSession> = {}): ShadowValidationSession {
  return {
    version: 1,
    sessionId: 'session-1',
    status: 'validating',
    stoppedReason: null,
    startedAt: '2026-09-02T00:00:00.000Z',
    completedAt: null,
    baselineModelVersion: 'weekly-anchor-trend-v2',
    baselineParams: BASELINE,
    candidateParams: { ...BASELINE, trendLookbackWeeks: 6 },
    candidateFingerprint: 'fingerprint',
    candidateSource: 'parameter-sensitivity:trendLookback',
    requiredSampleCount: SHADOW_REQUIRED_SAMPLE_COUNT,
    observations: [observation(1, 20, 10), observation(2, 30, 15)],
    ...overrides,
  };
}

function render(value: ShadowValidationSession | null) {
  return renderToStaticMarkup(createElement(AdminShadowValidation, { session: value }));
}

test('an in-flight session shows progress and marks the numbers as interim', () => {
  const markup = render(session());

  assert.match(markup, /Shadow 튜닝 후보 검증/);
  assert.match(markup, /검증 중 · 2\/13/);
  assert.match(markup, /새 실제값을 기준으로 현재 운영 설정과 Shadow 후보를 동시에 검증하고 있습니다/);
  assert.match(markup, /Model B · 추세 기간 8주 · Dubai · 반영 시차 1주 · 비중 20%/);
  assert.match(markup, /Model B · 추세 기간 6주 · Dubai · 반영 시차 1주 · 비중 20%/);
  assert.match(markup, /표본 13주가 확보되기 전까지는 중간 결과이며 우열을 판정하지 않습니다/);
  assert.doesNotMatch(markup, /운영 적용 검토 가능/);
  assert.doesNotMatch(markup, /운영 Forecast|Shadow Forecast|cooldown|data-label="Actual"/);
  assert.doesNotMatch(markup, /(?<!신규 )Actual(?!\s*[가-힣])/);
});

test('the cumulative comparison waits for the minimum number of new actuals', () => {
  const markup = render(session());

  assert.match(markup, /성능 판정 대기/);
  assert.match(markup, /신규 Actual 2개 · 최소 4개/);
  assert.match(markup, /Shadow 누적 MAE/);
  assert.match(markup, /운영 모델 누적 MAE/);
});

test('two degraded cumulative weeks report the stop condition without stopping the run', () => {
  const degraded = render(
    session({
      observations: Array.from({ length: 5 }, (_, index) => observation(index + 1, 20, 26)),
    }),
  );

  assert.match(degraded, /Shadow 중도중단 조건 충족 · 2\/2주/);
  assert.match(degraded, /운영 모델 대비<\/span><strong>\+30\.0% · \+6\.00원\/L<\/strong>/);
  assert.match(degraded, /중단 여부는 관리자가 결정합니다/);
  assert.match(degraded, /차기 후보가 더 좋다는 이유만으로는 현재 Shadow를 중단하지 않습니다/);
});

test('a single degraded window is only a watch state', () => {
  const watch = render(
    session({
      observations: Array.from({ length: 4 }, (_, index) => observation(index + 1, 20, 25)),
    }),
  );

  assert.match(watch, /Shadow 성능 악화 확인 · 1\/2주/);
  assert.match(watch, /다음 신규 Actual 반영 후 같은 조건이 다시 확인되면 중도중단 조건을 충족합니다/);
});

test('the comparison table pairs operating and shadow metrics', () => {
  const markup = render(session());

  assert.match(markup, /MAE<\/th><td data-label="현재 운영">25\.00원\/L<\/td><td data-label="Shadow">12\.50원\/L<\/td>/);
  assert.match(markup, /-12\.50원\/L/);
  assert.match(markup, /방향 정확도/);
  assert.match(markup, /예측값 변동성/);
  assert.match(markup, /운영 예측값/);
  assert.match(markup, /Shadow 예측값/);
  assert.match(markup, /실제값/);
});

test('a completed session that meets the existing rules is review-ready, not applied', () => {
  const observations = Array.from({ length: SHADOW_REQUIRED_SAMPLE_COUNT }, (_, index) =>
    observation(index + 1, 24 + (index % 2) * 2, 12 + (index % 2) * 2),
  );
  const markup = render(session({ observations }));

  assert.match(markup, /<span class="status-tag status-tag--ok">운영 적용 검토 가능<\/span>/);
  assert.match(markup, /운영 모델은 아직 변경되지 않았습니다/);
  assert.match(markup, /MAE·MAPE 개선<\/dt><dd>충족<\/dd>/);
  assert.match(markup, /운영 변경 조건<\/dt><dd>운영 변경 대기 기간 확인 필요<\/dd>/);
  assert.doesNotMatch(markup, /<button/);
  assert.doesNotMatch(markup, /Shadow 적용|바로 승격|자동 튜닝/);
});

test('a stopped session explains why the comparison ended', () => {
  const markup = render(session({ status: 'stopped', stoppedReason: 'baseline_params_changed' }));

  assert.match(markup, /<span class="status-tag">중단<\/span>/);
  assert.match(markup, /운영 모델 파라미터가 변경되었습니다/);
  assert.doesNotMatch(markup, /baseline_params_changed/);
});

test('week rows use the shared direction wording and mark pending actuals', () => {
  const pending = observation(3, 0, 0);
  const markup = render(
    session({
      observations: [
        observation(1, 20, 10),
        {
          ...pending,
          actualKrwPerL: null,
          baselineAbsoluteErrorKrwPerL: null,
          shadowAbsoluteErrorKrwPerL: null,
          baselineApePct: null,
          shadowApePct: null,
          actualDirection: null,
        },
      ],
    }),
  );

  assert.match(markup, /<span class="status-tag status-tag--ok">방향 적중<\/span>/);
  assert.match(markup, /확정 대기/);
  assert.doesNotMatch(markup, />적중<\/span>|>실패<\/span>/);
});

test('runs without shadow metadata explain that validation has not started', () => {
  const markup = render(null);

  assert.match(markup, /Shadow 검증 이력이 없습니다/);
  assert.match(markup, /비교 분석에서 개선 후보가 나오면 다음 예측부터 실제 데이터로 검증을 시작합니다/);
  assert.doesNotMatch(markup, /Actual로만 검증|튜닝 검토 후보를/);
  assert.doesNotMatch(markup, /<table/);
});
