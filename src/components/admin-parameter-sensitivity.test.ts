import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminParameterSensitivity } from './admin-parameter-sensitivity';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import type { CandidatePersistence } from '@/lib/forecast/candidate-persistence';
import type { CandidateRegimeComparison } from '@/lib/forecast/candidate-regime-comparison';
import {
  buildParameterSensitivity,
  serializeSensitivityParamsKey,
} from '@/lib/forecast/parameter-sensitivity';
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

function render(
  currentParams = CURRENT,
  betterTrendWeeks: number | null = 6,
  persistence: CandidatePersistence | null = null,
  regimeComparisons: readonly CandidateRegimeComparison[] = [],
) {
  const sensitivity = buildParameterSensitivity({
    currentParams,
    currentBacktest: backtest(currentParams, 22.8),
    evaluatedAt: new Date('2026-09-02T00:00:00.000Z'),
    evaluate: (params) =>
      backtest(params, params.trendLookbackWeeks === betterTrendWeeks ? 18.4 : 23.5),
  });

  return renderToStaticMarkup(
    createElement(AdminParameterSensitivity, { sensitivity, persistence, regimeComparisons }),
  );
}

function regimeRow(
  regime: CandidateRegimeComparison['regimes'][number]['regime'],
  sampleCount: number,
  currentMae: number,
  candidateMae: number,
  verdict: CandidateRegimeComparison['regimes'][number]['verdict'],
): CandidateRegimeComparison['regimes'][number] {
  return {
    regime,
    sampleCount,
    currentMaeKrwPerL: currentMae,
    candidateMaeKrwPerL: candidateMae,
    maeDeltaKrwPerL: Math.round((candidateMae - currentMae) * 100) / 100,
    currentMapePct: currentMae / 18,
    candidateMapePct: candidateMae / 18,
    currentDirectionAccuracyRatio: 0.62,
    candidateDirectionAccuracyRatio: 0.7,
    verdict,
  };
}

function comparison(
  overrides: Partial<CandidateRegimeComparison> = {},
): CandidateRegimeComparison {
  return {
    version: 1,
    evaluatedAt: '2026-09-02T00:00:00.000Z',
    windowWeeks: 26,
    label: 'Trend lookback 6주',
    kind: 'single',
    paramsKey: serializeSensitivityParamsKey({ ...CURRENT, trendLookbackWeeks: 6 }),
    candidateFingerprint: 'v1|B|6|1:0.2|none|0.03',
    comparedSampleCount: 21,
    regimes: [
      regimeRow('stable', 8, 22.1, 18.7, 'improved'),
      regimeRow('rising', 2, 28.3, 25.4, 'insufficient-sample'),
      regimeRow('falling', 6, 24.5, 24.5, 'similar'),
      regimeRow('high-volatility', 5, 35.2, 51.8, 'worsened'),
    ],
    weakestRegime: 'high-volatility',
    ...overrides,
  };
}

function persistenceState(overrides: Partial<CandidatePersistence> = {}): CandidatePersistence {
  return {
    version: 1,
    status: 'confirming',
    candidateFingerprint: 'v1|B|6|1:0.2|none|0.03',
    candidateParams: { ...CURRENT, trendLookbackWeeks: 6 },
    candidateSource: 'parameter-sensitivity:trendLookback',
    confirmedCount: 1,
    requiredCount: 2,
    lastConfirmedWeekEndDate: '2026-08-19T00:00:00.000Z',
    startedAt: '2026-08-19T01:00:00.000Z',
    updatedAt: '2026-08-19T01:00:00.000Z',
    ...overrides,
  };
}

test('the card shows the operating parameters and one collapsed group per factor', () => {
  const markup = render();

  assert.match(markup, /파라미터 민감도 분석/);
  assert.match(markup, /결과는 참고용이며 자동으로 적용되지 않습니다/);
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
  assert.match(markup, /1\. \[단일 설정\] Trend lookback 6주/);
  assert.match(markup, /13주 MAE 22\.80원\/L → 18\.40원\/L/);
  assert.match(markup, /기존 승격 품질 기준 충족/);
  assert.match(markup, /조합 후보도 실제 적용 전에 새 실제 데이터를 이용한 검증을 거치며/);
  assert.doesNotMatch(markup, /추천 설정|적용 예정|자동으로 적용됩니다/);
  assert.doesNotMatch(markup, /<button/);
});

test('the card leads with the automatic tuning flow guide', () => {
  const markup = render();

  assert.match(markup, /자동 튜닝 흐름/);
  assert.match(
    markup,
    /<p>최신 데이터가 반영되면 여러 예측 설정을 자동 비교해 현재보다 나은 후보를 찾습니다\.<\/p>/,
  );
  assert.match(
    markup,
    /<p>같은 후보가 새 주간 데이터에서 2주 연속 확인되면 Shadow에서 새 실제 데이터 13주로 검증하며, 결과가 좋아도 자동 적용되지는 않습니다\.<\/p>/,
  );

  const steps = markup.slice(markup.indexOf('tuning-flow__steps'));
  const stepLabels = [...steps.slice(0, steps.indexOf('</ol>')).matchAll(/tuning-flow__step">([^<]+)</g)].map(
    (match) => match[1],
  );

  assert.deepEqual(stepLabels, [
    '자동 비교',
    '후보 최대 3개',
    '1순위 2주 확인',
    'Shadow 검증 · 새 실제 데이터 13주',
    '운영 적용 검토',
  ]);
  assert.doesNotMatch(steps.slice(0, steps.indexOf('</ol>')), /→/);
  assert.match(markup, /class="tuning-flow__note">검증 중인 후보는 중간에 변경하지 않습니다\./);
});

test('shadow entry progress is visible while the candidate is being confirmed', () => {
  const markup = render(CURRENT, 6, persistenceState());

  assert.match(markup, /Shadow 진입 확인 · 1\/2주</);
  assert.match(markup, /같은 후보가 다음 새 주간 데이터에서도 기준을 통과하면 Shadow 검증을 시작합니다/);
  assert.doesNotMatch(markup, /최신 1순위 후보가 변경되어/);
});

test('a completed confirmation and a restarted one read differently', () => {
  const done = render(CURRENT, 6, persistenceState({ status: 'confirmed', confirmedCount: 2 }));
  const restarted = render(CURRENT, 6, persistenceState({ status: 'reset' }));

  assert.match(done, /Shadow 진입 확인 · 2\/2주 완료</);
  assert.match(done, /status-tag status-tag--ok/);
  assert.match(restarted, /Shadow 진입 확인 · 1\/2주</);
  assert.match(restarted, /최신 1순위 후보가 변경되어 확인을 다시 시작합니다/);
});

test('without an eligible candidate the gate explains that nothing is being confirmed', () => {
  const markup = render(
    CURRENT,
    null,
    persistenceState({
      status: 'waiting',
      candidateFingerprint: null,
      candidateParams: null,
      candidateSource: null,
      confirmedCount: 0,
      lastConfirmedWeekEndDate: null,
      startedAt: null,
    }),
  );

  assert.match(markup, /기준을 통과한 1순위 후보가 확인되면 Shadow 진입 확인을 시작합니다/);
  assert.doesNotMatch(markup, /Shadow 진입 확인 · /);
});

test('the candidate panel states the next-week evaluation basis', () => {
  const markup = render();

  assert.match(
    markup,
    /후보는 최근 13주의 다음 주 예측 성능을 중심으로 비교하며, 최근 26주의 다음 주 예측 결과로 장기 안정성을 함께 확인합니다\./,
  );
});

test('a candidate exposes its market regime comparison behind a collapsed disclosure', () => {
  const markup = render(CURRENT, 6, null, [comparison()]);
  const panel = markup.slice(markup.indexOf('candidate-regime'));

  assert.match(markup, /시장 국면별 성능 보기/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(panel, /최근 26주 중 현재 설정과 동일한 평가 주차 21주 기준/);
  assert.match(panel, /data-label="현재 MAE">22\.10원\/L/);
  assert.match(panel, /data-label="후보 MAE">18\.70원\/L/);
  assert.match(panel, /data-label="MAE 차이">\+16\.60원\/L/);
  assert.match(panel, /안정 개선/);
  assert.match(panel, /상승 추세 표본 부족/);
  assert.match(panel, /하락 추세 유사/);
  assert.match(panel, /고변동 악화/);
  assert.match(panel, /주의 · 고변동 구간에서 현재 설정보다 오차가 큽니다/);
  assert.match(panel, /현재 후보 선정 또는 Shadow 진입 조건에는 사용되지 않습니다/);
  assert.doesNotMatch(panel, /high-volatility|insufficient-sample/);
});

test('a candidate without a stored comparison renders no regime disclosure', () => {
  const markup = render(CURRENT, 6, null, [
    comparison({ paramsKey: 'other-candidate', weakestRegime: null }),
  ]);

  assert.doesNotMatch(markup, /시장 국면별 성능 보기/);
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
  assert.match(markup, /다음 예측 실행부터 설정별 성능 비교가 시작됩니다/);
  assert.doesNotMatch(markup, /walk-forward/);
  assert.doesNotMatch(markup, /<table/);
});
