import { getOpinetDisplayWeek, getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

import type {
  DashboardTrendDirection,
  FscDashboardOutlookWeekItem,
  FscDashboardWeeklyOutlook,
  FscDashboardWeekItem,
  WeeklyOutlookConfidence,
} from './fsc-types';

const ACTUAL_CONTEXT_WEEK_COUNT = 1;
const FORECAST_HORIZON_WEEK_COUNT = 13;

export interface WeeklyOutlookForecastPoint {
  horizonKind: 'weekly' | 'monthly';
  horizonIndex: number;
  targetDate: Date | string;
  pointKrwPerL: number;
  lowerBoundKrwPerL: number | null;
  upperBoundKrwPerL: number | null;
}

interface BuildWeeklyOutlookInput {
  actualWeeks: readonly FscDashboardWeekItem[];
  forecastPoints: readonly WeeklyOutlookForecastPoint[];
  basePriceKrwPerL: string;
}

function toDateOnly(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('주간 전망 날짜가 올바르지 않습니다.');
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function getIsoWeekNumber(value: Date): number {
  const thursday = new Date(value);
  const utcDay = thursday.getUTCDay() === 0 ? 7 : thursday.getUTCDay();
  thursday.setUTCDate(thursday.getUTCDate() + 4 - utcDay);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));

  return Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function getConfidence(horizonIndex: number): WeeklyOutlookConfidence {
  if (horizonIndex <= 4) return 'short';
  if (horizonIndex <= 8) return 'medium';
  return 'long';
}

function getDirection(changeKrwPerL: number): DashboardTrendDirection {
  if (Math.abs(changeKrwPerL) < 0.5) return 'flat';
  return changeKrwPerL > 0 ? 'up' : 'down';
}

function mapActualWeek(week: FscDashboardWeekItem, sequenceNo: number): FscDashboardOutlookWeekItem {
  return {
    ...week,
    sequenceNo,
    horizonIndex: null,
    confidence: 'actual',
    lowerBoundKrwPerL: null,
    upperBoundKrwPerL: null,
    previousPriceKrwPerL: null,
    weekOverWeekChangeKrwPerL: null,
  };
}

function mapForecastWeek(
  point: WeeklyOutlookForecastPoint,
  sequenceNo: number,
  basePriceKrwPerL: number,
): FscDashboardOutlookWeekItem {
  const targetDate = toDateOnly(point.targetDate);
  const weekStartDate = getOpinetWeekStart(targetDate);
  const weekEndDate = getOpinetWeekEnd(targetDate);
  const displayWeek = getOpinetDisplayWeek(weekStartDate, weekEndDate);
  const priceDiffKrwPerL = point.pointKrwPerL - basePriceKrwPerL;
  const diffRatio = basePriceKrwPerL === 0 ? 0 : priceDiffKrwPerL / basePriceKrwPerL;

  return {
    sequenceNo,
    targetMonth: displayWeek.month,
    weekNo: getIsoWeekNumber(targetDate),
    weekStartDate: formatDate(weekStartDate),
    weekEndDate: formatDate(weekEndDate),
    priceKind: 'forecast',
    priceKrwPerL: formatPrice(point.pointKrwPerL),
    actualPriceKrwPerL: null,
    forecastPriceKrwPerL: formatPrice(point.pointKrwPerL),
    forecastSourceKind: 'weekly_point',
    fallbackUsed: false,
    priceDiffKrwPerL: formatPrice(priceDiffKrwPerL),
    diffRatio: diffRatio.toFixed(6),
    horizonIndex: point.horizonIndex,
    confidence: getConfidence(point.horizonIndex),
    lowerBoundKrwPerL:
      point.lowerBoundKrwPerL === null ? null : formatPrice(point.lowerBoundKrwPerL),
    upperBoundKrwPerL:
      point.upperBoundKrwPerL === null ? null : formatPrice(point.upperBoundKrwPerL),
    previousPriceKrwPerL: null,
    weekOverWeekChangeKrwPerL: null,
  };
}

function addWeekOverWeekChanges(
  weeks: readonly FscDashboardOutlookWeekItem[],
  initialPreviousPriceKrwPerL: string | null,
): FscDashboardOutlookWeekItem[] {
  return weeks.map((week, index) => {
    const previousPriceKrwPerL = index === 0
      ? initialPreviousPriceKrwPerL
      : weeks[index - 1]?.priceKrwPerL ?? null;

    if (previousPriceKrwPerL === null) {
      return week;
    }

    return {
      ...week,
      previousPriceKrwPerL,
      weekOverWeekChangeKrwPerL: formatPrice(
        Number(week.priceKrwPerL) - Number(previousPriceKrwPerL),
      ),
    };
  });
}

export function buildWeeklyOutlook(input: BuildWeeklyOutlookInput): FscDashboardWeeklyOutlook {
  const completedActualWeeks = input.actualWeeks.filter((week) => week.priceKind === 'actual');
  const actualWeeks = completedActualWeeks
    .slice(-ACTUAL_CONTEXT_WEEK_COUNT)
    .map(mapActualWeek);
  const previousActualPriceKrwPerL = completedActualWeeks.at(-2)?.priceKrwPerL ?? null;
  const basePriceKrwPerL = Number(input.basePriceKrwPerL);
  const weeklyForecastPoints = input.forecastPoints
    .filter((point) => point.horizonKind === 'weekly')
    .sort((left, right) => left.horizonIndex - right.horizonIndex)
    .slice(0, FORECAST_HORIZON_WEEK_COUNT);
  const forecastWeeks = weeklyForecastPoints.map((point, index) =>
    mapForecastWeek(point, actualWeeks.length + index + 1, basePriceKrwPerL),
  );
  const weeks = addWeekOverWeekChanges(
    [...actualWeeks, ...forecastWeeks],
    previousActualPriceKrwPerL,
  );
  const latestActual = actualWeeks[actualWeeks.length - 1] ?? null;
  const forecastPrices = weeklyForecastPoints.map((point) => point.pointKrwPerL);
  const forecastMinimums = weeklyForecastPoints.map(
    (point) => point.lowerBoundKrwPerL ?? point.pointKrwPerL,
  );
  const forecastMaximums = weeklyForecastPoints.map(
    (point) => point.upperBoundKrwPerL ?? point.pointKrwPerL,
  );
  const forecastAverage =
    forecastPrices.length === 0
      ? null
      : forecastPrices.reduce((sum, value) => sum + value, 0) / forecastPrices.length;
  const lastForecastPrice = forecastPrices[forecastPrices.length - 1] ?? null;
  const hasConfidenceBounds = weeklyForecastPoints.some(
    (point) => point.lowerBoundKrwPerL !== null && point.upperBoundKrwPerL !== null,
  );
  const direction =
    latestActual === null || lastForecastPrice === null
      ? 'flat'
      : getDirection(lastForecastPrice - Number(latestActual.priceKrwPerL));

  return {
    basisDate: latestActual?.weekEndDate ?? null,
    actualWeekCount: actualWeeks.length,
    forecastWeekCount: forecastWeeks.length,
    latestActualPriceKrwPerL: latestActual?.priceKrwPerL ?? null,
    forecastAverageKrwPerL: forecastAverage === null ? null : formatPrice(forecastAverage),
    forecastMinKrwPerL:
      forecastMinimums.length === 0 ? null : formatPrice(Math.min(...forecastMinimums)),
    forecastMaxKrwPerL:
      forecastMaximums.length === 0 ? null : formatPrice(Math.max(...forecastMaximums)),
    hasConfidenceBounds,
    direction,
    weeks,
  };
}
