import { Prisma } from '@prisma/client';

import { calculateDataFreshness } from '@/lib/dashboard/dashboard-time';

import { MIN_RELIABILITY_SAMPLE_COUNT, type CalculateFscReliabilityInput, type CalculateFscReliabilityOutput } from './types';

const ROUND_HALF_UP = Prisma.Decimal.ROUND_HALF_UP;
const ZERO = new Prisma.Decimal(0);

interface BacktestPointRecord {
  actualKrwPerL: number;
  forecastKrwPerL: number;
  absoluteErrorKrwPerL: number;
  absolutePercentageErrorPct: number | null;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toDecimalOrNull(value: number | null, scale: number): Prisma.Decimal | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return new Prisma.Decimal(value).toDecimalPlaces(scale, ROUND_HALF_UP);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function readBacktestPoints(metadata: Prisma.JsonValue | null): BacktestPointRecord[] {
  if (!isRecord(metadata) || !isRecord(metadata.qualityGate) || !Array.isArray(metadata.qualityGate.backtestPoints)) {
    return [];
  }

  const points: BacktestPointRecord[] = [];

  for (const candidate of metadata.qualityGate.backtestPoints) {
    if (!isRecord(candidate)) {
      continue;
    }

    const actualKrwPerL = readNumber(candidate.actualKrwPerL);
    const forecastKrwPerL = readNumber(candidate.forecastKrwPerL);
    const absoluteErrorKrwPerL = readNumber(candidate.absoluteErrorKrwPerL);
    const absolutePercentageErrorPct =
      candidate.absolutePercentageErrorPct === null ? null : readNumber(candidate.absolutePercentageErrorPct);

    if (actualKrwPerL === null || forecastKrwPerL === null || absoluteErrorKrwPerL === null) {
      continue;
    }

    points.push({
      actualKrwPerL,
      forecastKrwPerL,
      absoluteErrorKrwPerL,
      absolutePercentageErrorPct,
    });
  }

  return points;
}

function calculateDirectionAccuracy(points: readonly BacktestPointRecord[]): Prisma.Decimal | null {
  if (points.length < 2) {
    return null;
  }

  let matches = 0;
  let comparisons = 0;

  for (let index = 1; index < points.length; index += 1) {
    const actualDelta = points[index].actualKrwPerL - points[index - 1].actualKrwPerL;
    const forecastDelta = points[index].forecastKrwPerL - points[index - 1].forecastKrwPerL;
    const actualDirection = Math.sign(actualDelta);
    const forecastDirection = Math.sign(forecastDelta);

    comparisons += 1;
    if (actualDirection === forecastDirection) {
      matches += 1;
    }
  }

  return comparisons === 0 ? null : new Prisma.Decimal(matches / comparisons).toDecimalPlaces(6, ROUND_HALF_UP);
}

function calculateBias(points: readonly BacktestPointRecord[], take: number): Prisma.Decimal | null {
  const window = points.slice(-take);
  const meanBias = mean(window.map((point) => point.forecastKrwPerL - point.actualKrwPerL));
  return toDecimalOrNull(meanBias, 3);
}

function calculateMae(points: readonly BacktestPointRecord[], take: number): Prisma.Decimal | null {
  const window = points.slice(-take);
  return toDecimalOrNull(mean(window.map((point) => point.absoluteErrorKrwPerL)), 3);
}

function calculateMape(points: readonly BacktestPointRecord[], take: number): Prisma.Decimal | null {
  const values = points
    .slice(-take)
    .map((point) => point.absolutePercentageErrorPct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return toDecimalOrNull(mean(values), 6);
}

function calculateRecent4wErrorTrend(points: readonly BacktestPointRecord[]): string | null {
  if (points.length < 8) {
    return null;
  }

  const previous4 = mean(points.slice(-8, -4).map((point) => point.absoluteErrorKrwPerL));
  const recent4 = mean(points.slice(-4).map((point) => point.absoluteErrorKrwPerL));

  if (previous4 === null || recent4 === null) {
    return null;
  }

  if (recent4 <= previous4 * 0.95) {
    return 'improving';
  }

  if (recent4 >= previous4 * 1.05) {
    return 'worsening';
  }

  return 'stable';
}

function calculateReliabilityGrade(
  sampleCount: number,
  recent13wWeeklyPriceMape: Prisma.Decimal | null,
): string {
  if (sampleCount < MIN_RELIABILITY_SAMPLE_COUNT || recent13wWeeklyPriceMape === null) {
    return 'U';
  }

  const mape = recent13wWeeklyPriceMape.toNumber();

  if (mape <= 3) {
    return 'A';
  }
  if (mape <= 5) {
    return 'B';
  }
  if (mape <= 7.5) {
    return 'C';
  }
  if (mape <= 10) {
    return 'D';
  }

  return 'E';
}

function calculateFreshnessStatus(
  currentTruthCutoffAt: Date | null,
  now: Date,
): CalculateFscReliabilityOutput['dataFreshnessStatus'] {
  return calculateDataFreshness(currentTruthCutoffAt, now);
}

export function calculateFscReliability(input: CalculateFscReliabilityInput): CalculateFscReliabilityOutput {
  const backtestPoints = readBacktestPoints(input.forecastRun?.metadata ?? null);
  const reliabilitySampleCount = backtestPoints.length;
  const recent13wWeeklyPriceMae = calculateMae(backtestPoints, 13);
  const recent13wWeeklyPriceMape = calculateMape(backtestPoints, 13);
  const recent13wQuarterAveragePriceMae = null;
  const recent13wDirectionAccuracy = calculateDirectionAccuracy(backtestPoints.slice(-13));
  const recent4wWeeklyPriceMae = calculateMae(backtestPoints, 4);
  const recent4wErrorTrend = calculateRecent4wErrorTrend(backtestPoints);
  const recent26wWeeklyPriceMae =
    input.forecastRun?.maeKrwPerL?.toDecimalPlaces(3, ROUND_HALF_UP) ?? calculateMae(backtestPoints, 26);
  const forecastBias4w = calculateBias(backtestPoints, 4);
  const forecastBias13w = calculateBias(backtestPoints, 13);
  const reliabilityGrade = calculateReliabilityGrade(reliabilitySampleCount, recent13wWeeklyPriceMape);
  const dataFreshnessStatus = calculateFreshnessStatus(input.currentTruthCutoffAt, input.now ?? new Date());

  return {
    recent13wWeeklyPriceMae,
    recent13wWeeklyPriceMape,
    recent13wQuarterAveragePriceMae,
    recent13wDirectionAccuracy,
    recent4wWeeklyPriceMae,
    recent4wErrorTrend,
    recent26wWeeklyPriceMae,
    forecastBias4w,
    forecastBias13w,
    reliabilitySampleCount,
    reliabilityMinimumSampleCount: MIN_RELIABILITY_SAMPLE_COUNT,
    reliabilityGrade,
    dataFreshnessStatus,
  };
}
