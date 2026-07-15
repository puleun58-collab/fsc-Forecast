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

test('reliability remains U when valid backtest sample count is below minimum', () => {
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(0, null), currentTruthCutoffAt: null }).reliabilityGrade, 'U');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(1, 1.0), currentTruthCutoffAt: null }).reliabilityGrade, 'U');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(12, 2.0), currentTruthCutoffAt: null }).reliabilityGrade, 'U');
});

test('reliability sample count is read only from completed backtest points', () => {
  const result = calculateFscReliability({ forecastRun: createForecastRun(4, 4.2), currentTruthCutoffAt: null });

  assert.equal(result.reliabilitySampleCount, 4);
  assert.equal(result.reliabilityMinimumSampleCount, MIN_RELIABILITY_SAMPLE_COUNT);
  assert.equal(result.reliabilityGrade, 'U');
});

test('reliability grade uses recent 13-point MAPE thresholds only', () => {
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 2.9), currentTruthCutoffAt: null }).reliabilityGrade, 'A');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 3.0), currentTruthCutoffAt: null }).reliabilityGrade, 'A');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 3.1), currentTruthCutoffAt: null }).reliabilityGrade, 'B');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 5.0), currentTruthCutoffAt: null }).reliabilityGrade, 'B');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 5.1), currentTruthCutoffAt: null }).reliabilityGrade, 'C');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 7.5), currentTruthCutoffAt: null }).reliabilityGrade, 'C');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 7.6), currentTruthCutoffAt: null }).reliabilityGrade, 'D');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 10.0), currentTruthCutoffAt: null }).reliabilityGrade, 'D');
  assert.equal(calculateFscReliability({ forecastRun: createForecastRun(13, 10.1), currentTruthCutoffAt: null }).reliabilityGrade, 'E');
});

test('reliability stays U when MAPE is unavailable even if MAE exists', () => {
  const result = calculateFscReliability({
    forecastRun: createForecastRun(13, null, 12),
    currentTruthCutoffAt: null,
  });

  assert.equal(result.reliabilitySampleCount, 13);
  assert.equal(result.reliabilityGrade, 'U');
  assert.equal(result.recent13wWeeklyPriceMape, null);
  assert.equal(result.recent26wWeeklyPriceMae?.toFixed(3), '12.000');
});
