import assert from 'node:assert/strict';
import test from 'node:test';

import { ForecastHorizonKind } from '@prisma/client';

import type { ForecastModelParams } from './forecast-model-config';
import {
  buildParameterSensitivity,
  DIAGNOSTIC_TREND_LOOKBACK_CANDIDATES,
  readParameterSensitivity,
  serializeSensitivityParamsKey,
  TUNING_CANDIDATE_LIMIT,
} from './parameter-sensitivity';
import { runWalkForwardBacktest, type RunWalkForwardBacktestResult } from './run-walk-forward-backtest';
import type { ForecastSeriesPoint } from './types';

const CURRENT: ForecastModelParams = {
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  externalAdjustmentCapRatio: 0.03,
};

function metrics(overrides: Partial<RunWalkForwardBacktestResult['recentOneStep']> = {}) {
  return {
    windowWeeks: 13,
    sampleCount: 13,
    maeKrwPerL: 22.8,
    mapePct: 1.27,
    rmseKrwPerL: 25,
    medianAbsoluteErrorKrwPerL: 20,
    maxAbsoluteErrorKrwPerL: 58.5,
    directionAccuracyRatio: 0.62,
    forecastChurnKrwPerL: 5,
    ...overrides,
  };
}

function backtest(
  params: ForecastModelParams,
  overrides: Partial<RunWalkForwardBacktestResult['recentOneStep']> = {},
): RunWalkForwardBacktestResult {
  const recent = metrics(overrides);

  return {
    params,
    recent,
    long: metrics({ windowWeeks: 26, maeKrwPerL: (overrides.maeKrwPerL ?? 22.8) + 1.7 }),
    recentOneStep: recent,
    longOneStep: metrics({ windowWeeks: 26, maeKrwPerL: (overrides.maeKrwPerL ?? 22.8) + 1.7 }),
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [],
  };
}

function build(
  currentParams = CURRENT,
  evaluate: (params: ForecastModelParams) => RunWalkForwardBacktestResult | null = (params) =>
    backtest(params),
  current = backtest(currentParams),
) {
  return buildParameterSensitivity({
    currentParams,
    currentBacktest: current,
    evaluate,
    evaluatedAt: new Date('2026-09-02T00:00:00.000Z'),
  });
}

test('trend candidates cover the diagnostic range and mark the current setting once', () => {
  const sensitivity = build();
  const trend = sensitivity.groups.find((group) => group.key === 'trendLookback');

  assert.deepEqual(
    trend?.candidates.map((candidate) => candidate.params.trendLookbackWeeks),
    [...DIAGNOSTIC_TREND_LOOKBACK_CANDIDATES],
  );
  assert.equal(trend?.candidates.filter((candidate) => candidate.isCurrent).length, 1);
  assert.equal(trend?.candidates.find((candidate) => candidate.isCurrent)?.label, '8주');
});

test('each group changes exactly one parameter', () => {
  const sensitivity = build();
  const trend = sensitivity.groups.find((group) => group.key === 'trendLookback');
  const dubai = sensitivity.groups.find((group) => group.key === 'dubai');
  const cap = sensitivity.groups.find((group) => group.key === 'cap');

  for (const candidate of trend?.candidates ?? []) {
    assert.deepEqual(candidate.params.dubai, CURRENT.dubai);
    assert.equal(candidate.params.usdKrw, null);
    assert.equal(candidate.params.externalAdjustmentCapRatio, CURRENT.externalAdjustmentCapRatio);
  }

  for (const candidate of dubai?.candidates ?? []) {
    assert.equal(candidate.params.trendLookbackWeeks, CURRENT.trendLookbackWeeks);
    assert.equal(candidate.params.usdKrw, null);
    assert.equal(candidate.params.externalAdjustmentCapRatio, CURRENT.externalAdjustmentCapRatio);
  }

  for (const candidate of cap?.candidates ?? []) {
    assert.equal(candidate.params.trendLookbackWeeks, CURRENT.trendLookbackWeeks);
    assert.deepEqual(candidate.params.dubai, CURRENT.dubai);
  }
});

test('USD/KRW sensitivity is skipped when the current model has no Dubai correction', () => {
  const modelA: ForecastModelParams = { ...CURRENT, modelId: 'A', dubai: null };
  const sensitivity = build(modelA);
  const usdKrw = sensitivity.groups.find((group) => group.key === 'usdKrw');
  const dubai = sensitivity.groups.find((group) => group.key === 'dubai');

  assert.equal(usdKrw?.status, 'not-applicable');
  assert.equal(usdKrw?.candidates.length, 0);
  assert.match(usdKrw?.notApplicableReason ?? '', /Dubai 보정을 사용하는 모델에서 평가할 수 있습니다/);
  assert.equal(dubai?.status, 'evaluated');
  assert.equal(dubai?.candidates.find((candidate) => candidate.isCurrent)?.label, '미사용');
});

test('the current setting reuses the existing backtest instead of a new evaluation', () => {
  const evaluated: string[] = [];
  const sensitivity = build(CURRENT, (params) => {
    evaluated.push(serializeSensitivityParamsKey(params));
    return backtest(params);
  });

  assert.equal(evaluated.includes(serializeSensitivityParamsKey(CURRENT)), false);
  assert.equal(sensitivity.currentRecentOneStep.maeKrwPerL, 22.8);
  assert.equal(
    sensitivity.groups
      .find((group) => group.key === 'trendLookback')
      ?.candidates.find((candidate) => candidate.isCurrent)?.recentOneStep.maeKrwPerL,
    22.8,
  );
});

test('only candidates passing the existing promotion guardrails become tuning candidates', () => {
  const sensitivity = build(CURRENT, (params) => {
    if (params.trendLookbackWeeks === 6) {
      return backtest(params, { maeKrwPerL: 18.4, mapePct: 1.02, maxAbsoluteErrorKrwPerL: 50 });
    }

    if (params.trendLookbackWeeks === 4) {
      // 단기 MAE는 최저지만 최대 오차와 변동성이 크게 나빠진 후보.
      return backtest(params, {
        maeKrwPerL: 17.2,
        mapePct: 0.98,
        maxAbsoluteErrorKrwPerL: 120,
        forecastChurnKrwPerL: 40,
      });
    }

    return backtest(params);
  });
  const labels = sensitivity.tuningCandidates.map((candidate) => candidate.label);
  const trendFour = sensitivity.groups
    .find((group) => group.key === 'trendLookback')
    ?.candidates.find((candidate) => candidate.label === '4주');

  assert.ok(sensitivity.tuningCandidates.length <= TUNING_CANDIDATE_LIMIT);
  assert.equal(labels.includes('6주'), true);
  assert.equal(labels.includes('4주'), false);
  assert.equal(trendFour?.qualityChecks?.meetsMinimumImprovement, true);
  assert.equal(trendFour?.qualityChecks?.maxErrorStable, false);
  assert.equal(sensitivity.tuningCandidates.every((candidate) => candidate.meetsPromotionQuality), true);
});

test('an insufficient sample count blocks candidate proposals', () => {
  const sensitivity = build(
    CURRENT,
    (params) => backtest(params, { maeKrwPerL: 10, sampleCount: 6 }),
    backtest(CURRENT, { sampleCount: 6 }),
  );

  assert.equal(sensitivity.sampleSufficient, false);
  assert.deepEqual(sensitivity.tuningCandidates, []);
});

test('metadata round-trips through the reader', () => {
  const sensitivity = build();

  assert.equal(readParameterSensitivity(null), null);
  assert.equal(readParameterSensitivity({ model: {} }), null);
  assert.equal(
    readParameterSensitivity({ model: { parameterSensitivity: sensitivity } })?.currentParams.modelId,
    'B',
  );
});

function series(prices: readonly number[]): ForecastSeriesPoint[] {
  return prices.map((price, index) => {
    const periodStart = new Date(Date.UTC(2026, 0, 2 + index * 7));
    const periodEnd = new Date(Date.UTC(2026, 0, 6 + index * 7));

    return {
      horizonKind: ForecastHorizonKind.weekly,
      periodStart,
      periodEnd,
      targetDate: periodEnd,
      pointKrwPerL: price,
      sampleCount: 5,
    };
  });
}

test('diagnostic runs use the same walk-forward result as the operating evaluation', () => {
  const prices = Array.from({ length: 30 }, (_, index) => 1800 + Math.sin(index / 2) * 30);
  const params: ForecastModelParams = { ...CURRENT, modelId: 'A', dubai: null };
  const operating = runWalkForwardBacktest({
    weeklySeries: series(prices),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params,
    horizonCount: 1,
  });
  const sensitivity = buildParameterSensitivity({
    currentParams: params,
    currentBacktest: operating,
    evaluatedAt: new Date('2026-09-02T00:00:00.000Z'),
    evaluate: (candidateParams) =>
      runWalkForwardBacktest({
        weeklySeries: series(prices),
        indicatorSeries: { dubai: [], usdKrw: [] },
        params: candidateParams,
        horizonCount: 1,
      }),
  });
  const currentCandidate = sensitivity.groups
    .find((group) => group.key === 'trendLookback')
    ?.candidates.find((candidate) => candidate.isCurrent);

  assert.equal(currentCandidate?.recentOneStep.maeKrwPerL, operating.recentOneStep.maeKrwPerL);
  assert.equal(currentCandidate?.longOneStep.maeKrwPerL, operating.longOneStep.maeKrwPerL);
});

test('diagnostic candidates never read data after their evaluation origin', () => {
  const prices = Array.from({ length: 24 }, (_, index) => 1800 + index * 4);
  const params: ForecastModelParams = { ...CURRENT, modelId: 'A', dubai: null, trendLookbackWeeks: 6 };
  const baseline = runWalkForwardBacktest({
    weeklySeries: series(prices),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params,
    horizonCount: 1,
  });
  const mutated = runWalkForwardBacktest({
    weeklySeries: series([...prices.slice(0, 18), 9999, 9999, 9999, 9999, 9999, 9999]),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params,
    horizonCount: 1,
  });

  assert.deepEqual(
    mutated.oneStepPoints.slice(0, 12).map((item) => item.forecastKrwPerL),
    baseline.oneStepPoints.slice(0, 12).map((item) => item.forecastKrwPerL),
  );
});
