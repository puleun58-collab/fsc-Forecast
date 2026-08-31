import assert from 'node:assert/strict';
import test from 'node:test';

import { ForecastHorizonKind } from '@prisma/client';

import type { ForecastIndicatorWeeklyPoint } from './build-weekly-forecast';
import {
  FALLBACK_FORECAST_MODEL_PARAMS,
  type ForecastModelParams,
} from './forecast-model-config';
import { runWalkForwardBacktest } from './run-walk-forward-backtest';
import { selectForecastModel } from './select-forecast-model';
import type { ForecastSeriesPoint } from './types';

const WEEK_MS = 604_800_000;
const FIRST_WEEK_END = new Date('2026-01-01T00:00:00.000Z');

function createWeeklySeries(prices: readonly number[]): ForecastSeriesPoint[] {
  return prices.map((price, index) => {
    const targetDate = new Date(FIRST_WEEK_END.getTime() + WEEK_MS * index);

    return {
      horizonKind: ForecastHorizonKind.weekly,
      periodStart: new Date(targetDate.getTime() - WEEK_MS + 86_400_000),
      periodEnd: targetDate,
      targetDate,
      pointKrwPerL: price,
      sampleCount: 5,
    };
  });
}

function createIndicatorSeries(values: readonly number[]): ForecastIndicatorWeeklyPoint[] {
  return values.map((value, index) => {
    const weekEndDate = new Date(FIRST_WEEK_END.getTime() + WEEK_MS * index);
    return { weekEndDate, observedAt: weekEndDate, value };
  });
}

function buildLinearPrices(count: number, start: number, delta: number): number[] {
  return Array.from({ length: count }, (_unused, index) => start + delta * index);
}

function buildNoisyPrices(count: number, start: number, delta: number, noise: number): number[] {
  return Array.from(
    { length: count },
    (_unused, index) => start + delta * index + (index % 2 === 0 ? noise : -noise),
  );
}

test('walk-forward backtest scores a perfectly linear series without error and never leaks future weeks', () => {
  const result = runWalkForwardBacktest({
    weeklySeries: createWeeklySeries(buildLinearPrices(30, 1900, -8)),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    horizonCount: 13,
  });

  assert.equal(result.recent.maeKrwPerL, 0);
  assert.equal(result.recent.rmseKrwPerL, 0);
  assert.equal(result.recent.directionAccuracyRatio, 1);
  assert.equal(result.long.maeKrwPerL, 0);
  assert.equal(result.horizons.length, 13);
  assert.equal(result.horizons[0].horizonIndex, 1);
  assert.ok(result.horizons[0].sampleCount > result.horizons[12].sampleCount);
  assert.equal(result.absoluteErrorByHorizon.get(1), 0);
});

test('walk-forward horizon metrics keep separate error distributions per horizon', () => {
  const result = runWalkForwardBacktest({
    weeklySeries: createWeeklySeries(buildNoisyPrices(40, 1900, -5, 12)),
    indicatorSeries: { dubai: [], usdKrw: [] },
    params: FALLBACK_FORECAST_MODEL_PARAMS,
    horizonCount: 13,
  });
  const horizonOne = result.horizons[0];
  const horizonFour = result.horizons[3];

  assert.ok((horizonOne.maeKrwPerL ?? 0) > 0);
  assert.ok((horizonFour.maeKrwPerL ?? 0) > 0);
  assert.notEqual(horizonOne.maeKrwPerL, horizonFour.maeKrwPerL);
  assert.ok(horizonOne.absoluteErrorQuantilesKrwPerL.p90 >= horizonOne.absoluteErrorQuantilesKrwPerL.p50);
  assert.ok(horizonOne.absoluteErrorQuantilesKrwPerL.p95 >= horizonOne.absoluteErrorQuantilesKrwPerL.p90);
  assert.notEqual(
    horizonOne.absoluteErrorQuantilesKrwPerL.p90,
    horizonFour.absoluteErrorQuantilesKrwPerL.p90,
  );
});

test('model comparison keeps the current model when it is already the best candidate', () => {
  const selection = selectForecastModel({
    weeklySeries: createWeeklySeries(buildLinearPrices(40, 1900, -6)),
    indicatorSeries: {
      dubai: createIndicatorSeries(buildLinearPrices(40, 80, 0)),
      usdKrw: createIndicatorSeries(buildLinearPrices(40, 1300, 0)),
    },
    horizonCount: 13,
    currentParams: FALLBACK_FORECAST_MODEL_PARAMS,
    currentPromotedAt: null,
    now: new Date('2026-10-15T00:00:00.000Z'),
  });

  assert.equal(selection.promoted, false);
  assert.equal(selection.promotionReason, 'kept_current_model_already_best');
  assert.equal(selection.selectedParams.modelId, 'A');
  assert.ok(selection.evaluatedCandidateCount > 100);
  assert.ok(selection.bestByModelId.A !== null);
  assert.ok(selection.bestByModelId.B !== null);
  assert.ok(selection.bestByModelId.C !== null);
});

test('a clearly better model is promoted only with recent improvement and long-window stability', () => {
  const currentParams: ForecastModelParams = {
    modelId: 'C',
    trendLookbackWeeks: 8,
    dubai: { lagWeeks: 1, weight: 0.2 },
    usdKrw: { lagWeeks: 1, weight: 0.1 },
    externalAdjustmentCapRatio: 0.03,
  };
  const oscillating = Array.from({ length: 40 }, (_unused, index) => (index % 2 === 0 ? 80 : 96));
  const selection = selectForecastModel({
    weeklySeries: createWeeklySeries(buildLinearPrices(40, 1900, -6)),
    indicatorSeries: {
      dubai: createIndicatorSeries(oscillating),
      usdKrw: createIndicatorSeries(oscillating.map((value) => value * 16)),
    },
    horizonCount: 13,
    currentParams,
    currentPromotedAt: null,
    now: new Date('2026-10-15T00:00:00.000Z'),
  });

  assert.equal(selection.promoted, true);
  assert.equal(selection.promotionReason, 'promoted_recent_improvement_with_long_stability');
  assert.equal(selection.selectedParams.modelId, 'A');
  assert.ok((selection.maeImprovementRatio ?? 0) >= 0.05);
  assert.ok((selection.currentBacktest.recent.maeKrwPerL ?? 0) > 0);
  assert.equal(selection.selectedBacktest.recent.maeKrwPerL, 0);
});

test('promotion is blocked during the cooldown window even when a better model exists', () => {
  const currentParams: ForecastModelParams = {
    modelId: 'C',
    trendLookbackWeeks: 8,
    dubai: { lagWeeks: 1, weight: 0.2 },
    usdKrw: { lagWeeks: 1, weight: 0.1 },
    externalAdjustmentCapRatio: 0.03,
  };
  const oscillating = Array.from({ length: 40 }, (_unused, index) => (index % 2 === 0 ? 80 : 96));
  const selection = selectForecastModel({
    weeklySeries: createWeeklySeries(buildLinearPrices(40, 1900, -6)),
    indicatorSeries: {
      dubai: createIndicatorSeries(oscillating),
      usdKrw: createIndicatorSeries(oscillating.map((value) => value * 16)),
    },
    horizonCount: 13,
    currentParams,
    currentPromotedAt: new Date('2026-10-10T00:00:00.000Z'),
    now: new Date('2026-10-15T00:00:00.000Z'),
  });

  assert.equal(selection.promoted, false);
  assert.equal(selection.promotionReason, 'kept_current_model_promotion_cooldown');
  assert.equal(selection.selectedParams.modelId, 'C');
  assert.equal(selection.selectedParams.dubai?.weight, 0.2);
});

test('a marginally better candidate does not reach the minimum improvement threshold', () => {
  const currentParams: ForecastModelParams = {
    modelId: 'B',
    trendLookbackWeeks: 8,
    dubai: { lagWeeks: 1, weight: 0.05 },
    usdKrw: null,
    externalAdjustmentCapRatio: 0.02,
  };
  const selection = selectForecastModel({
    weeklySeries: createWeeklySeries(buildNoisyPrices(40, 1900, -5, 12)),
    indicatorSeries: {
      dubai: createIndicatorSeries(
        Array.from({ length: 40 }, (_unused, index) => 80 * (1 + index * 0.0005)),
      ),
      usdKrw: createIndicatorSeries(
        Array.from({ length: 40 }, (_unused, index) => 1300 * (1 + index * 0.0002)),
      ),
    },
    horizonCount: 13,
    currentParams,
    currentPromotedAt: null,
    now: new Date('2026-10-15T00:00:00.000Z'),
  });

  assert.equal(selection.promoted, false);
  assert.equal(selection.promotionReason, 'kept_current_model_improvement_below_minimum');
  assert.equal(selection.selectedParams.dubai?.weight, 0.05);
  assert.ok((selection.maeImprovementRatio ?? 1) < 0.05);
  assert.ok(Math.abs(selection.mapeImprovementPctPoint ?? 1) < 0.1);
});
