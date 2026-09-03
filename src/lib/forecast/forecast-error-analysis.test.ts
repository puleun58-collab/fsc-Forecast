import assert from 'node:assert/strict';
import test from 'node:test';

import { ForecastHorizonKind } from '@prisma/client';

import {
  buildForecastErrorAnalysis,
  buildForecastErrorAnalysisPoint,
  readForecastErrorAnalysis,
  summarizeForecastErrorAnalysis,
} from './forecast-error-analysis';
import type { ForecastModelParams } from './forecast-model-config';
import { runWalkForwardBacktest } from './run-walk-forward-backtest';
import type { WalkForwardEvaluationPoint } from './run-walk-forward-backtest';
import type { ForecastSeriesPoint } from './types';

const PARAMS: ForecastModelParams = {
  biasCorrection: null,
  dailySignal: null,
  modelId: 'C',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: { lagWeeks: 1, weight: 0.05 },
  externalAdjustmentCapRatio: 0.02,
};

function point(overrides: Partial<WalkForwardEvaluationPoint> = {}): WalkForwardEvaluationPoint {
  return {
    originWeekEndDate: new Date('2026-08-07T00:00:00.000Z'),
    targetDate: new Date('2026-08-14T00:00:00.000Z'),
    horizonIndex: 1,
    anchorKrwPerL: 1800,
    actualKrwPerL: 1820,
    forecastKrwPerL: 1790,
    absoluteErrorKrwPerL: 30,
    absolutePercentageErrorPct: 1.65,
    actualDirection: 'up',
    forecastDirection: 'down',
    trendDeltaKrwPerL: -10,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
    ...overrides,
  };
}

test('removing the trend shows whether the trend widened or reduced the error', () => {
  const widened = buildForecastErrorAnalysisPoint(point(), PARAMS);
  const reduced = buildForecastErrorAnalysisPoint(
    point({ trendDeltaKrwPerL: 10, forecastKrwPerL: 1810, absoluteErrorKrwPerL: 10 }),
    PARAMS,
  );

  assert.equal(widened.factors.trend.forecastKrwPerL, 1800);
  assert.equal(widened.factors.trend.absoluteErrorKrwPerL, 20);
  assert.equal(widened.factors.trend.errorImpactKrwPerL, 10);
  assert.equal(reduced.factors.trend.forecastKrwPerL, 1800);
  assert.equal(reduced.factors.trend.errorImpactKrwPerL, -10);
});

test('removing Dubai keeps the trend and the USD/KRW contribution with the cap re-applied', () => {
  const analysed = buildForecastErrorAnalysisPoint(
    point({
      dubaiContributionRatio: 0.03,
      usdKrwContributionRatio: 0.005,
      rawExternalAdjustmentRatio: 0.035,
      externalAdjustmentRatio: 0.02,
      externalAdjustmentCapReached: true,
    }),
    PARAMS,
  );

  // (1800 - 10) × (1 + 0.005) = 1798.95 — USD/KRW만 남고 cap(2%)에는 다시 걸리지 않는다.
  assert.equal(analysed.factors.dubai.forecastKrwPerL, 1798.95);
  assert.equal(analysed.factors.usdKrw.forecastKrwPerL, 1825.8);
  assert.equal(analysed.factors.cap.applied, true);
  // cap 미적용 진단값은 raw 보정 3.5%를 그대로 적용한다.
  assert.equal(analysed.factors.cap.forecastKrwPerL, 1852.65);
});

test('indicators the selected model does not use stay unused instead of fabricated', () => {
  const analysed = buildForecastErrorAnalysisPoint(
    point({ dubaiContributionRatio: 0.01, rawExternalAdjustmentRatio: 0.01, externalAdjustmentRatio: 0.01 }),
    { ...PARAMS, modelId: 'B', usdKrw: null },
  );

  assert.equal(analysed.factors.dubai.applied, true);
  assert.equal(analysed.factors.usdKrw.applied, false);
  assert.equal(analysed.factors.usdKrw.forecastKrwPerL, null);
  assert.equal(analysed.factors.usdKrw.errorImpactKrwPerL, null);
  assert.equal(analysed.factors.cap.applied, false);
});

test('model comparisons pair the same origin and target week', () => {
  const selectedPoints = [
    point({ targetDate: new Date('2026-08-07T00:00:00.000Z'), forecastKrwPerL: 1790, absoluteErrorKrwPerL: 30 }),
    point(),
  ];
  const analysis = buildForecastErrorAnalysis({
    selectedModelId: 'C',
    selectedParams: PARAMS,
    selectedBacktest: { oneStepPoints: selectedPoints },
    candidateBacktestsByModelId: {
      A: {
        oneStepPoints: [
          point({ targetDate: new Date('2026-08-14T00:00:00.000Z'), forecastKrwPerL: 1815, absoluteErrorKrwPerL: 5 }),
        ],
      },
      B: null,
      C: { oneStepPoints: selectedPoints },
    },
  });
  const latest = analysis.points[1]!;

  assert.equal(analysis.points.length, 2);
  assert.deepEqual(
    latest.modelComparisons.map((row) => [row.modelId, row.absoluteErrorKrwPerL]),
    [
      ['A', 5],
      ['C', 30],
    ],
  );
  assert.equal(analysis.points[0]!.modelComparisons.length, 1);
  assert.equal(analysis.points[0]!.modelComparisons[0]?.modelId, 'C');
});

test('the summary counts improving and worsening weeks and ranks the largest errors', () => {
  const analysis = buildForecastErrorAnalysis({
    selectedModelId: 'C',
    selectedParams: PARAMS,
    selectedBacktest: {
      oneStepPoints: [
        point({
          targetDate: new Date('2026-08-07T00:00:00.000Z'),
          trendDeltaKrwPerL: 10,
          forecastKrwPerL: 1810,
          absoluteErrorKrwPerL: 10,
        }),
        point(),
      ],
    },
    candidateBacktestsByModelId: { A: null, B: null, C: null },
  });
  const summary = summarizeForecastErrorAnalysis(analysis);
  const trend = summary.factors.find((factor) => factor.key === 'trend');

  assert.equal(trend?.appliedWeekCount, 2);
  assert.equal(trend?.reducedWeekCount, 1);
  assert.equal(trend?.increasedWeekCount, 1);
  assert.equal(trend?.averageErrorImpactKrwPerL, 0);
  assert.equal(summary.largestErrorPoints[0]?.selectedAbsoluteErrorKrwPerL, 30);
  assert.equal(summary.factors.find((factor) => factor.key === 'usdKrw')?.appliedWeekCount, 0);
});

test('metadata without the analysis block reads as missing instead of throwing', () => {
  assert.equal(readForecastErrorAnalysis(null), null);
  assert.equal(readForecastErrorAnalysis({ model: {} }), null);
  assert.equal(
    readForecastErrorAnalysis({ model: { errorAnalysis: { version: 1, selectedModelId: 'B', points: [] } } })
      ?.selectedModelId,
    'B',
  );
});

function buildSeries(prices: readonly number[]): ForecastSeriesPoint[] {
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

test('counterfactuals never read data after the evaluated origin', () => {
  const prices = Array.from({ length: 20 }, (_, index) => 1800 + index * 5);
  const indicatorSeries = { dubai: [], usdKrw: [] };
  const params: ForecastModelParams = {
    biasCorrection: null,
    dailySignal: null,
    modelId: 'A',
    trendLookbackWeeks: 8,
    dubai: null,
    usdKrw: null,
    externalAdjustmentCapRatio: 0.02,
  };
  const baseline = runWalkForwardBacktest({
    weeklySeries: buildSeries(prices),
    indicatorSeries,
    params,
    horizonCount: 1,
  });
  const mutated = runWalkForwardBacktest({
    weeklySeries: buildSeries([...prices.slice(0, 15), 9999, 9999, 9999, 9999, 9999]),
    indicatorSeries,
    params,
    horizonCount: 1,
  });
  const analysedBaseline = baseline.oneStepPoints
    .slice(0, 10)
    .map((item) => buildForecastErrorAnalysisPoint(item, params));
  const analysedMutated = mutated.oneStepPoints
    .slice(0, 10)
    .map((item) => buildForecastErrorAnalysisPoint(item, params));

  assert.deepEqual(
    analysedMutated.map((item) => [item.targetDate, item.selectedForecastKrwPerL, item.factors.trend.forecastKrwPerL]),
    analysedBaseline.map((item) => [item.targetDate, item.selectedForecastKrwPerL, item.factors.trend.forecastKrwPerL]),
  );
});

test('stored analysis reproduces the recorded one-step forecasts of the selected model', () => {
  const series = buildSeries(Array.from({ length: 24 }, (_, index) => 1800 + Math.sin(index) * 20));
  const params: ForecastModelParams = {
    biasCorrection: null,
    dailySignal: null,
    modelId: 'A',
    trendLookbackWeeks: 8,
    dubai: null,
    usdKrw: null,
    externalAdjustmentCapRatio: 0.02,
  };
  const backtest = runWalkForwardBacktest({
    weeklySeries: series,
    indicatorSeries: { dubai: [], usdKrw: [] },
    params,
    horizonCount: 1,
  });
  const analysis = buildForecastErrorAnalysis({
    selectedModelId: 'A',
    selectedParams: params,
    selectedBacktest: backtest,
    candidateBacktestsByModelId: { A: backtest, B: null, C: null },
  });
  const summary = summarizeForecastErrorAnalysis(analysis);
  const recentPoints = backtest.oneStepPoints.slice(-13);
  const expectedMae =
    recentPoints.reduce((sum, item) => sum + item.absoluteErrorKrwPerL, 0) / recentPoints.length;
  const modelA = summary.modelSummaries.find((model) => model.modelId === 'A');

  assert.equal(summary.points.length, Math.min(13, backtest.oneStepPoints.length));
  assert.equal(modelA?.isSelected, true);
  assert.ok(Math.abs((modelA?.maeKrwPerL ?? 0) - expectedMae) < 1e-9);
  assert.ok(Math.abs((backtest.recentOneStep.maeKrwPerL ?? 0) - expectedMae) < 0.01);
});
