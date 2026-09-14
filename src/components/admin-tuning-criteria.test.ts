import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminTuningCriteria } from './admin-tuning-criteria';
import { FALLBACK_FORECAST_MODEL_PARAMS } from '@/lib/forecast/forecast-model-config';
import type {
  ShadowObservation,
  ShadowValidationSession,
} from '@/lib/forecast/shadow-validation';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function observation(index: number, shadowError: number): ShadowObservation {
  return {
    originWeekEndDate: `2026-08-${String(7 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
    targetDate: `2026-08-${String(14 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
    issuedAt: `2026-08-${String(7 + index * 7).padStart(2, '0')}T01:00:00.000Z`,
    anchorKrwPerL: 1_800,
    baselineForecastKrwPerL: 1_810,
    shadowForecastKrwPerL: 1_800 + shadowError,
    actualKrwPerL: 1_800,
    baselineAbsoluteErrorKrwPerL: 10,
    shadowAbsoluteErrorKrwPerL: shadowError,
    baselineApePct: 0.56,
    shadowApePct: (shadowError / 1_800) * 100,
    baselineDirection: 'up',
    shadowDirection: 'up',
    actualDirection: 'up',
  };
}

function session(observations: ShadowObservation[]): ShadowValidationSession {
  return {
    version: 1,
    sessionId: 'shadow-test',
    status: 'validating',
    stoppedReason: null,
    startedAt: '2026-08-01T00:00:00.000Z',
    completedAt: null,
    baselineModelVersion: 'test-v1',
    baselineParams: FALLBACK_FORECAST_MODEL_PARAMS,
    candidateParams: { ...FALLBACK_FORECAST_MODEL_PARAMS, trendLookbackWeeks: 6 },
    candidateFingerprint: 'candidate',
    candidateSource: 'parameter-sensitivity:trend',
    requiredSampleCount: 13,
    observations,
  };
}

function render(shadowSession: ShadowValidationSession | null = null): string {
  return renderToStaticMarkup(createElement(AdminTuningCriteria, { session: shadowSession }));
}

test('the operating criteria stay collapsed while the full workflow remains visible', () => {
  const markup = render();
  const summary = markup.slice(0, markup.indexOf('</summary>'));

  assert.match(summary, /튜닝·Shadow 운영 기준/);
  assert.match(summary, /후보 2주 확인 → Shadow 13주 검증 → 기준 통과 시 운영 전환 검토/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(summary, /보기 ▾/);
});

test('the disclosure explains every threshold used by the operating logic', () => {
  const markup = render();

  assert.match(markup, /튜닝 검토 후보 기준/);
  assert.match(markup, /후보 교체<\/dt><dd><strong>5% \+ 0\.5원\/L/);
  assert.match(markup, /연속 확인<\/dt><dd><strong>2주/);
  assert.match(markup, /같은 주차 재실행은 횟수에 포함하지 않습니다/);

  assert.match(markup, /Shadow 검증 통과 기준/);
  assert.match(markup, /Shadow 검증<\/dt><dd><strong>13주/);
  assert.match(markup, /정확도 개선<\/dt><dd><strong>MAE 5% 또는 MAPE 0\.1%p/);
  assert.match(markup, /최대 오차<\/dt><dd><strong>110% 이내/);
  assert.match(
    markup,
    /Forecast 변화폭<\/dt><dd><strong>운영 모델의 2배 이내/,
  );
  assert.match(markup, /지난주와 이번 주의 Forecast 변화폭을 비교합니다/);
  assert.match(markup, /후보가 운영 모델의 2배를 넘으면 불안정한 예측으로 판단합니다/);
  assert.match(
    markup,
    /<b>예시<\/b> 운영 모델이 평균 10원\/L이면 후보는 20원\/L 이내여야 합니다/,
  );
  assert.match(
    markup,
    /admin-tuning-criteria__clarifier">※ 실제 유가 변동폭이 아니라, 매주 새로 산출되는 Forecast 값 자체의 변화폭을\s+비교합니다/,
  );
  assert.doesNotMatch(markup, /Forecast 변동성/);

  assert.match(markup, /Shadow 중단 기준/);
  assert.match(markup, /중단 판단 시작<\/dt><dd><strong>4주/);
  assert.match(markup, /악화 기준<\/dt><dd><strong>20% \+ 5원\/L/);
  assert.match(markup, /연속 악화<\/dt><dd><strong>2주/);
  assert.match(markup, /중단 권고가 표시되어도 자동으로 Shadow를 종료하지 않습니다/);
});

test('an active Shadow watch connects progress and stop confirmation to the criteria', () => {
  const markup = render(
    session([
      observation(0, 10),
      observation(1, 10),
      observation(2, 10),
      observation(3, 30),
    ]),
  );

  assert.match(
    markup,
    /admin-tuning-criteria__context-status">현재 Shadow 검증 진행 중<strong class="admin-tuning-criteria__context-progress">4\/13주/,
  );
  assert.match(markup, /현재 중단 기준 확인 중 1\/2주/);
  assert.match(markup, /중단 권고가 표시되어도 자동으로 Shadow를 종료하지 않습니다/);
});
