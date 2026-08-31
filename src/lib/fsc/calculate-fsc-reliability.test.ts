import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import { calculateFscReliability } from './calculate-fsc-reliability';
import { MIN_RELIABILITY_SAMPLE_COUNT } from './types';

function createBacktestPoints(count: number, absolutePercentageErrorPct: number | null) {
  return Array.from({ length: count }, (_, index) => ({
    targetDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    actualKrwPerL: 100,
    forecastKrwPerL: absolutePercentageErrorPct === null ? 101 : 100 + absolutePercentageErrorPct,
    absoluteErrorKrwPerL: absolutePercentageErrorPct === null ? 1 : absolutePercentageErrorPct,
    absolutePercentageErrorPct,
  }));
}

function createForecastRun(count: number, absolutePercentageErrorPct: number | null, maeKrwPerL: number | null = null) {
  return {
    id: 'forecast-run',
    forecastModelVersion: null,
    mapePct: null,
    maeKrwPerL: maeKrwPerL === null ? null : new Prisma.Decimal(maeKrwPerL),
    metadata: {
      qualityGate: {
        backtestPoints: createBacktestPoints(count, absolutePercentageErrorPct),
      },
    },
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    completedAt: new Date('2026-07-15T00:00:00.000Z'),
    points: [],
  };
}

const FRESH_CUTOFF = new Date('2026-07-15T00:00:00.000Z');
const NOW = new Date('2026-07-15T06:00:00.000Z');

function reliabilityOf(count: number, absolutePercentageErrorPct: number | null, maeKrwPerL: number | null = null) {
  return calculateFscReliability({
    forecastRun: createForecastRun(count, absolutePercentageErrorPct, maeKrwPerL),
    currentTruthCutoffAt: FRESH_CUTOFF,
    now: NOW,
  });
}

test('reliability remains U when valid backtest sample count is below minimum', () => {
  assert.equal(reliabilityOf(0, null).reliabilityGrade, 'U');
  assert.equal(reliabilityOf(1, 1.0).reliabilityGrade, 'U');
  assert.equal(reliabilityOf(12, 2.0).reliabilityGrade, 'U');
});

test('reliability sample count is read only from completed backtest points', () => {
  const result = reliabilityOf(4, 4.2);

  assert.equal(result.reliabilitySampleCount, 4);
  assert.equal(result.reliabilityMinimumSampleCount, MIN_RELIABILITY_SAMPLE_COUNT);
  assert.equal(result.reliabilityGrade, 'U');
});

test('base grade follows the 13-week MAPE thresholds before guardrails', () => {
  assert.equal(reliabilityOf(13, 0.9).baseReliabilityGrade, 'A+');
  assert.equal(reliabilityOf(13, 1.4).baseReliabilityGrade, 'A');
  assert.equal(reliabilityOf(13, 2.4).baseReliabilityGrade, 'B');
  assert.equal(reliabilityOf(13, 3.9).baseReliabilityGrade, 'C');
  assert.equal(reliabilityOf(13, 5.9).baseReliabilityGrade, 'D');
  assert.equal(reliabilityOf(13, 6.1).baseReliabilityGrade, 'E');
});

test('complete and stable guardrail metrics keep the top grade', () => {
  const result = reliabilityOf(13, 0.9);

  assert.equal(result.baseReliabilityGrade, 'A+');
  assert.equal(result.reliabilityGrade, 'A+');
  assert.deepEqual(result.reliabilityAdjustmentReasons, []);
  assert.equal(result.recent4wErrorTrend, 'stable');
});

test('unavailable data freshness blocks any reliability rating', () => {
  const result = calculateFscReliability({
    forecastRun: createForecastRun(13, 0.9),
    currentTruthCutoffAt: null,
    now: NOW,
  });

  assert.equal(result.baseReliabilityGrade, 'A+');
  assert.equal(result.reliabilityGrade, 'U');
  assert.deepEqual(result.reliabilityAdjustmentReasons, ['data_unavailable']);
});

test('reliability stays U when MAPE is unavailable and 26-week MAE comes from backtest points', () => {
  const result = reliabilityOf(13, null, 12);

  assert.equal(result.reliabilitySampleCount, 13);
  assert.equal(result.reliabilityGrade, 'U');
  assert.equal(result.recent13wWeeklyPriceMape, null);
  assert.equal(result.recent26wWeeklyPriceMae?.toFixed(3), '1.000');
});
