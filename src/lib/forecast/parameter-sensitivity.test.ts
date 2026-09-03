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
  type ParameterSensitivity,
} from './parameter-sensitivity';
import {
  runWalkForwardBacktest,
  type RunWalkForwardBacktestResult,
  type WalkForwardEvaluationPoint,
} from './run-walk-forward-backtest';
import type { ForecastDailyPriceRow, ForecastSeriesPoint } from './types';

const CURRENT: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
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

/** 전체 예측(recent/long)과 다음 주 예측(recentOneStep/longOneStep)이 서로 다른 후보. */
function splitBacktest(
  params: ForecastModelParams,
  full: Partial<RunWalkForwardBacktestResult['recent']>,
  oneStep: Partial<RunWalkForwardBacktestResult['recentOneStep']>,
  oneStepLongMae = (oneStep.maeKrwPerL ?? 22.8) + 1.7,
): RunWalkForwardBacktestResult {
  return {
    params,
    recent: metrics(full),
    long: metrics({ windowWeeks: 26, maeKrwPerL: (full.maeKrwPerL ?? 22.8) + 1.7 }),
    recentOneStep: metrics(oneStep),
    longOneStep: metrics({ windowWeeks: 26, maeKrwPerL: oneStepLongMae }),
    horizons: [],
    absoluteErrorByHorizon: new Map(),
    oneStepPoints: [],
  };
}

function buildWithTrendCandidate(
  candidateFull: Partial<RunWalkForwardBacktestResult['recent']>,
  candidateOneStep: Partial<RunWalkForwardBacktestResult['recentOneStep']>,
  candidateOneStepLongMae?: number,
): ParameterSensitivity {
  return build(CURRENT, (params) =>
    params.trendLookbackWeeks === 6
      ? splitBacktest(params, candidateFull, candidateOneStep, candidateOneStepLongMae)
      : backtest(params),
  );
}

function includesTrendSix(sensitivity: ParameterSensitivity): boolean {
  return sensitivity.tuningCandidates.some((candidate) => candidate.params.trendLookbackWeeks === 6);
}

test('a candidate that only improves the full horizon is not a tuning candidate', () => {
  const sensitivity = buildWithTrendCandidate({ maeKrwPerL: 14, mapePct: 0.8 }, { maeKrwPerL: 24.5 });

  assert.equal(sensitivity.qualityBasis, 'one-step');
  assert.equal(includesTrendSix(sensitivity), false);
});

test('a candidate that only improves the next-week forecast is a tuning candidate', () => {
  const sensitivity = buildWithTrendCandidate(
    { maeKrwPerL: 40, mapePct: 2.4, maxAbsoluteErrorKrwPerL: 120, forecastChurnKrwPerL: 30 },
    { maeKrwPerL: 18.4, mapePct: 1.02 },
  );
  const candidate = sensitivity.tuningCandidates.find(
    (entry) => entry.params.trendLookbackWeeks === 6,
  );

  assert.equal(candidate?.meetsPromotionQuality, true);
  assert.equal(candidate?.recentOneStep.maeKrwPerL, 18.4);
});

test('a candidate without thirteen next-week samples is excluded', () => {
  const sensitivity = buildWithTrendCandidate(
    { maeKrwPerL: 18.4 },
    { maeKrwPerL: 12, sampleCount: 12 },
  );

  assert.equal(sensitivity.sampleSufficient, true);
  assert.equal(includesTrendSix(sensitivity), false);
});

test('next-week MAPE improvement alone qualifies a candidate', () => {
  const sensitivity = buildWithTrendCandidate({ maeKrwPerL: 22.8 }, { maeKrwPerL: 22.0, mapePct: 1.1 });
  const candidate = sensitivity.tuningCandidates.find(
    (entry) => entry.params.trendLookbackWeeks === 6,
  );

  assert.ok((candidate?.qualityChecks.maeImprovementRatio ?? 0) < 0.05);
  assert.equal(candidate?.qualityChecks.meetsMinimumImprovement, true);
  assert.equal(candidate?.meetsPromotionQuality, true);
});

test('next-week long window, max error, and churn guardrails exclude candidates', () => {
  const longUnstable = buildWithTrendCandidate({ maeKrwPerL: 18.4 }, { maeKrwPerL: 18.4 }, 26);
  const maxErrorUnstable = buildWithTrendCandidate(
    { maeKrwPerL: 18.4 },
    { maeKrwPerL: 18.4, maxAbsoluteErrorKrwPerL: 58.5 * 1.2 },
  );
  const churnUnstable = buildWithTrendCandidate(
    { maeKrwPerL: 18.4 },
    { maeKrwPerL: 18.4, forecastChurnKrwPerL: 11 },
  );

  assert.equal(includesTrendSix(longUnstable), false);
  assert.equal(includesTrendSix(maxErrorUnstable), false);
  assert.equal(includesTrendSix(churnUnstable), false);
});

test('older sensitivity metadata reads as the full-horizon basis', () => {
  const sensitivity = build();
  const legacy = JSON.parse(JSON.stringify(sensitivity)) as Record<string, unknown>;

  delete legacy.qualityBasis;
  legacy.version = 2;

  assert.equal(
    readParameterSensitivity({ model: { parameterSensitivity: legacy } })?.qualityBasis,
    'full-horizon',
  );
  assert.equal(
    readParameterSensitivity({ model: { parameterSensitivity: sensitivity } })?.qualityBasis,
    'one-step',
  );
});

/** Trend 6주와 Dubai lag 2주/15%만 개선되고, 그 조합이 가장 좋은 시나리오. */
function combinationEvaluate(params: ForecastModelParams): RunWalkForwardBacktestResult {
  const trendImproved = params.trendLookbackWeeks === 6;
  const dubaiImproved = params.dubai?.lagWeeks === 2 && params.dubai.weight === 0.15;

  if (trendImproved && dubaiImproved) {
    return backtest(params, { maeKrwPerL: 16.9, mapePct: 0.94 });
  }

  if (trendImproved) {
    return backtest(params, { maeKrwPerL: 18.4, mapePct: 1.02 });
  }

  if (dubaiImproved) {
    return backtest(params, { maeKrwPerL: 19.6, mapePct: 1.09 });
  }

  return backtest(params);
}

test('combination seeds use the best qualified candidate of each group', () => {
  const analysis = build(CURRENT, combinationEvaluate).combinationAnalysis;

  assert.equal(analysis?.status, 'evaluated');
  assert.deepEqual(
    analysis?.seeds.map((seed) => seed.groupKey),
    ['trendLookback', 'dubai'],
  );
  assert.equal(analysis?.seeds.find((seed) => seed.groupKey === 'trendLookback')?.label, '6주');
  assert.equal(analysis?.seeds.every((seed) => seed.qualityChecks.longStable), true);
});

test('combinations pair two different factors and never grow past two changes', () => {
  const analysis = build(CURRENT, combinationEvaluate).combinationAnalysis;
  const candidate = analysis?.candidates[0];

  assert.equal(analysis?.candidates.length, 1);
  assert.deepEqual(candidate?.factorKeys, ['trendLookback', 'dubai']);
  assert.equal(candidate?.params.trendLookbackWeeks, 6);
  assert.deepEqual(candidate?.params.dubai, { lagWeeks: 2, weight: 0.15 });
  assert.equal(candidate?.params.externalAdjustmentCapRatio, CURRENT.externalAdjustmentCapRatio);
  assert.equal(candidate?.params.usdKrw, null);
  assert.equal(candidate?.label, 'Trend 6주 + Dubai 반영 시차 2주 · 반영 비중 15%');
});

test('a stronger combination outranks the single candidates it was built from', () => {
  const sensitivity = build(CURRENT, combinationEvaluate);

  assert.equal(sensitivity.tuningCandidates[0]?.kind, 'combination');
  assert.equal(sensitivity.tuningCandidates[0]?.recentOneStep.maeKrwPerL, 16.9);
  assert.equal(sensitivity.tuningCandidates[1]?.kind, 'single');
  assert.ok(sensitivity.tuningCandidates.length <= TUNING_CANDIDATE_LIMIT);
});

test('a single qualified group produces no combination candidates', () => {
  const analysis = build(CURRENT, (params) =>
    params.trendLookbackWeeks === 6 ? backtest(params, { maeKrwPerL: 18.4 }) : backtest(params),
  ).combinationAnalysis;

  assert.equal(analysis?.status, 'insufficient-seeds');
  assert.deepEqual(analysis?.candidates, []);
  assert.equal(analysis?.evaluatedCandidateCount, 0);
});

test('every parameter set is evaluated by walk-forward at most once', () => {
  const evaluated: string[] = [];
  build(CURRENT, (params) => {
    evaluated.push(serializeSensitivityParamsKey(params));
    return combinationEvaluate(params);
  });

  assert.equal(evaluated.length, new Set(evaluated).size);
});

test('combination candidates stay inside the maximum pair budget', () => {
  const currentWithUsd: ForecastModelParams = {
    ...CURRENT,
    modelId: 'C',
    usdKrw: { lagWeeks: 1, weight: 0.05 },
  };
  const analysis = build(currentWithUsd, (params) => {
    const improved =
      params.trendLookbackWeeks === 6 ||
      (params.dubai?.lagWeeks === 2 && params.dubai.weight === 0.15) ||
      (params.usdKrw?.lagWeeks === 2 && params.usdKrw.weight === 0.05) ||
      params.externalAdjustmentCapRatio === 0.02;

    return improved ? backtest(params, { maeKrwPerL: 18, mapePct: 1 }) : backtest(params);
  }).combinationAnalysis;

  assert.ok((analysis?.seeds.length ?? 0) <= 4);
  assert.ok((analysis?.candidates.length ?? 0) <= 6);
  assert.equal(
    analysis?.candidates.every((candidate) => candidate.factorKeys.length === 2),
    true,
  );
  assert.equal(
    analysis?.candidates.every(
      (candidate) => candidate.params.usdKrw === null || candidate.params.dubai !== null,
    ),
    true,
  );
});

test('version 1 metadata without combination analysis still reads', () => {
  const sensitivity = build();
  const legacy = {
    ...sensitivity,
    version: 1,
    combinationAnalysis: undefined,
    tuningCandidates: sensitivity.tuningCandidates.map(({ kind, factorKeys, ...rest }) => {
      void kind;
      void factorKeys;
      return rest;
    }),
  };
  const parsed = readParameterSensitivity({ model: { parameterSensitivity: legacy } });

  assert.equal(parsed?.version, 1);
  assert.equal(parsed?.combinationAnalysis, null);
  assert.equal(parsed?.tuningCandidates.every((candidate) => candidate.kind === 'single'), true);
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

function dailyRows(count: number, start = 1950, step = 6): ForecastDailyPriceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    priceDate: new Date(Date.UTC(2026, 7, 1 + index)),
    observedPriceKrwPerL: start + index * step,
    currentRevisionId: `revision-${index}`,
  }));
}

function buildWithDaily(dailyPrices: ForecastDailyPriceRow[], oneStepPoints: WalkForwardEvaluationPoint[] = []) {
  const current = { ...backtest(CURRENT), oneStepPoints };

  return buildParameterSensitivity({
    currentParams: CURRENT,
    currentBacktest: current,
    evaluatedAt: new Date('2026-09-02T00:00:00.000Z'),
    evaluate: (params) => ({ ...backtest(params), oneStepPoints }),
    dailyPrices,
  });
}

test('the daily signal group offers the current setting plus the two documented weights', () => {
  const sensitivity = buildWithDaily(dailyRows(8));
  const daily = sensitivity.groups.find((group) => group.key === 'dailySignal');

  assert.equal(daily?.status, 'evaluated');
  assert.deepEqual(
    daily?.candidates.map((candidate) => candidate.label),
    ['미사용', '최근 5개 · 25%', '최근 5개 · 50%'],
  );
  assert.equal(daily?.candidates.find((candidate) => candidate.isCurrent)?.label, '미사용');
});

test('fewer than five daily observations skip the daily signal group entirely', () => {
  const sensitivity = buildWithDaily(dailyRows(3));
  const daily = sensitivity.groups.find((group) => group.key === 'dailySignal');

  assert.equal(daily?.status, 'not-applicable');
  assert.deepEqual(daily?.candidates, []);
  assert.match(daily?.notApplicableReason ?? '', /일별 데이터가 3개뿐이라/);
});

test('daily signal candidates reuse the base walk-forward instead of running a new one', () => {
  const evaluated: string[] = [];
  const dailyPrices = dailyRows(8);
  const sensitivity = buildParameterSensitivity({
    currentParams: CURRENT,
    currentBacktest: backtest(CURRENT),
    evaluatedAt: new Date('2026-09-02T00:00:00.000Z'),
    evaluate: (params) => {
      evaluated.push(serializeSensitivityParamsKey(params));
      return backtest(params);
    },
    dailyPrices,
  });
  const daily = sensitivity.groups.find((group) => group.key === 'dailySignal');

  assert.equal(daily?.candidates.length, 3);
  assert.equal(
    evaluated.filter((key) => key.endsWith('|5:0.25') || key.endsWith('|5:0.5')).length,
    0,
  );
});
