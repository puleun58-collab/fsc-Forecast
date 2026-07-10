import { Prisma, type QuarterSetting } from '@prisma/client';

import type {
  BuildFscQuarterWeeksResult,
  FscQuarterWeekDraft,
  FscSourceDailyPriceRow,
  FscSourceForecastPointRow,
  FscSourceForecastRunRecord,
} from './types';

const ROUND_HALF_UP = Prisma.Decimal.ROUND_HALF_UP;
const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

type QuarterSettingInput = Pick<
  QuarterSetting,
  | 'targetYear'
  | 'targetQuarter'
  | 'quarterStartDate'
  | 'quarterEndDate'
  | 'basePriceKrwPerL'
  | 'appliedPriceKrwPerL'
>;

export interface BuildFscQuarterWeeksInput {
  quarterSetting: QuarterSettingInput;
  currentTruthCutoffAt: Date | null;
  dailyPrices: readonly FscSourceDailyPriceRow[];
  forecastRun: FscSourceForecastRunRecord | null;
}

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function clampStart(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function clampEnd(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function daysInclusive(startDate: Date, endDate: Date): number {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

function formatDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMonthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getUtcWeekStart(value: Date): Date {
  const normalized = toDateOnly(value);
  const dayOfWeek = normalized.getUTCDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  normalized.setUTCDate(normalized.getUTCDate() + offset);
  return normalized;
}

function getUtcWeekEnd(value: Date): Date {
  return addDays(getUtcWeekStart(value), 6);
}

function getIsoWeekNumber(value: Date): number {
  const weekStart = getUtcWeekStart(value);
  const thursday = addDays(weekStart, 3);
  const isoWeekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoWeekYear, 0, 4));
  const firstThursdayDay = firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - firstThursdayDay));
  const diffMs = thursday.getTime() - firstThursday.getTime();
  return Math.round(diffMs / 604_800_000) + 1;
}

function roundPrice(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(3, ROUND_HALF_UP);
}

function roundRatio(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(6, ROUND_HALF_UP);
}

function averageDecimals(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  if (values.length === 0) {
    throw new Error('Cannot average an empty decimal list.');
  }

  const sum = values.reduce((total, value) => total.plus(value), ZERO);
  return roundPrice(sum.dividedBy(values.length));
}

function buildWeeklyForecastIndex(points: readonly FscSourceForecastPointRow[]): Map<string, FscSourceForecastPointRow> {
  return new Map(
    points
      .filter((point) => point.horizonKind === 'weekly')
      .map((point) => [formatDateKey(toDateOnly(point.targetDate)), point]),
  );
}

function buildMonthlyForecastIndex(points: readonly FscSourceForecastPointRow[]): Map<string, FscSourceForecastPointRow> {
  return new Map(
    points
      .filter((point) => point.horizonKind === 'monthly')
      .map((point) => [formatMonthKey(toDateOnly(point.targetDate)), point]),
  );
}

function findCarryForwardForecastPoint(
  points: readonly FscSourceForecastPointRow[],
  anchorDate: Date,
): FscSourceForecastPointRow | null {
  let candidate: FscSourceForecastPointRow | null = null;

  for (const point of points) {
    const pointDate = toDateOnly(point.targetDate);

    if (pointDate.getTime() > anchorDate.getTime()) {
      break;
    }

    candidate = point;
  }

  return candidate;
}

function createForecastWeekDraft(
  quarterSetting: QuarterSettingInput,
  effectiveStart: Date,
  effectiveEnd: Date,
  fullWeekEnd: Date,
  weekNo: number,
  sequenceNo: number,
  forecastRun: FscSourceForecastRunRecord | null,
): FscQuarterWeekDraft {
  const forecastPoints = forecastRun?.points ?? [];
  const weeklyIndex = buildWeeklyForecastIndex(forecastPoints);
  const monthlyIndex = buildMonthlyForecastIndex(forecastPoints);
  const weeklyMatch = weeklyIndex.get(formatDateKey(fullWeekEnd)) ?? null;
  const monthlyMatch = monthlyIndex.get(formatMonthKey(effectiveEnd)) ?? null;
  const carryForward = findCarryForwardForecastPoint(forecastPoints, fullWeekEnd);

  let sourceKind: FscQuarterWeekDraft['forecastSourceKind'];
  let sourcePoint: FscSourceForecastPointRow | null;
  let priceKrwPerL: Prisma.Decimal;
  let fallbackUsed = false;
  let sourcePriceDate: Date | null;

  if (weeklyMatch) {
    sourceKind = 'weekly_point';
    sourcePoint = weeklyMatch;
    priceKrwPerL = weeklyMatch.pointKrwPerL;
    sourcePriceDate = weeklyMatch.targetDate;
  } else if (monthlyMatch) {
    sourceKind = 'monthly_point';
    sourcePoint = monthlyMatch;
    priceKrwPerL = monthlyMatch.pointKrwPerL;
    sourcePriceDate = monthlyMatch.targetDate;
  } else if (carryForward) {
    sourceKind = 'carry_forward';
    sourcePoint = carryForward;
    priceKrwPerL = carryForward.pointKrwPerL;
    sourcePriceDate = carryForward.targetDate;
    fallbackUsed = true;
  } else if (quarterSetting.appliedPriceKrwPerL.gt(ZERO)) {
    sourceKind = 'applied_price_fallback';
    sourcePoint = null;
    priceKrwPerL = quarterSetting.appliedPriceKrwPerL;
    sourcePriceDate = null;
    fallbackUsed = true;
  } else {
    sourceKind = 'base_price_fallback';
    sourcePoint = null;
    priceKrwPerL = quarterSetting.basePriceKrwPerL;
    sourcePriceDate = null;
    fallbackUsed = true;
  }

  const roundedPrice = roundPrice(priceKrwPerL);
  const priceDiffKrwPerL = roundPrice(roundedPrice.minus(quarterSetting.basePriceKrwPerL));
  const diffRatio = roundRatio(priceDiffKrwPerL.dividedBy(quarterSetting.basePriceKrwPerL));

  return {
    targetYear: quarterSetting.targetYear,
    targetQuarter: quarterSetting.targetQuarter,
    targetMonth: effectiveEnd.getUTCMonth() + 1,
    weekNo,
    sequenceNo,
    weekStartDate: effectiveStart,
    weekEndDate: effectiveEnd,
    priceKind: 'forecast',
    priceKrwPerL: roundedPrice,
    actualPriceKrwPerL: null,
    forecastPriceKrwPerL: roundedPrice,
    sourcePriceDate,
    sourceRevisionIds: null,
    forecastPointId: sourcePoint?.id ?? null,
    forecastSourceKind: sourceKind,
    fallbackUsed,
    basePriceKrwPerL: quarterSetting.basePriceKrwPerL,
    priceDiffKrwPerL,
    diffRatio,
  };
}

export function buildFscQuarterWeeks(input: BuildFscQuarterWeeksInput): BuildFscQuarterWeeksResult {
  const quarterStartDate = toDateOnly(input.quarterSetting.quarterStartDate);
  const quarterEndDate = toDateOnly(input.quarterSetting.quarterEndDate);
  const currentTruthCutoffAt = input.currentTruthCutoffAt === null ? null : toDateOnly(input.currentTruthCutoffAt);
  const dailyPriceMap = new Map(input.dailyPrices.map((row) => [formatDateKey(toDateOnly(row.priceDate)), row]));
  const weeks: FscQuarterWeekDraft[] = [];
  const sourceBreakdown = {
    actual: 0,
    weekly_point: 0,
    monthly_point: 0,
    carry_forward: 0,
    applied_price_fallback: 0,
    base_price_fallback: 0,
  };

  let cursor = getUtcWeekStart(quarterStartDate);
  let sequenceNo = 1;

  while (cursor.getTime() <= quarterEndDate.getTime()) {
    const fullWeekStart = cursor;
    const fullWeekEnd = getUtcWeekEnd(fullWeekStart);
    const effectiveStart = clampStart(fullWeekStart, quarterStartDate);
    const effectiveEnd = clampEnd(fullWeekEnd, quarterEndDate);
    const weekNo = getIsoWeekNumber(fullWeekStart);
    const slotRows: FscSourceDailyPriceRow[] = [];

    for (let day = new Date(effectiveStart); day.getTime() <= effectiveEnd.getTime(); day = addDays(day, 1)) {
      const row = dailyPriceMap.get(formatDateKey(day));
      if (row) {
        slotRows.push(row);
      }
    }

    const expectedDayCount = daysInclusive(effectiveStart, effectiveEnd);
    const hasCompletedActualWeek =
      currentTruthCutoffAt !== null &&
      effectiveEnd.getTime() <= currentTruthCutoffAt.getTime() &&
      slotRows.length === expectedDayCount;

    if (hasCompletedActualWeek) {
      const actualPriceKrwPerL = averageDecimals(slotRows.map((row) => row.observedPriceKrwPerL));
      const priceDiffKrwPerL = roundPrice(actualPriceKrwPerL.minus(input.quarterSetting.basePriceKrwPerL));
      const diffRatio = roundRatio(priceDiffKrwPerL.dividedBy(input.quarterSetting.basePriceKrwPerL));
      weeks.push({
        targetYear: input.quarterSetting.targetYear,
        targetQuarter: input.quarterSetting.targetQuarter,
        targetMonth: effectiveEnd.getUTCMonth() + 1,
        weekNo,
        sequenceNo,
        weekStartDate: effectiveStart,
        weekEndDate: effectiveEnd,
        priceKind: 'actual',
        priceKrwPerL: actualPriceKrwPerL,
        actualPriceKrwPerL,
        forecastPriceKrwPerL: null,
        sourcePriceDate: slotRows[slotRows.length - 1]?.priceDate ?? null,
        sourceRevisionIds: slotRows.map((row) => row.currentRevisionId),
        forecastPointId: null,
        forecastSourceKind: null,
        fallbackUsed: false,
        basePriceKrwPerL: input.quarterSetting.basePriceKrwPerL,
        priceDiffKrwPerL,
        diffRatio,
      });
      sourceBreakdown.actual += 1;
    } else {
      const forecastWeek = createForecastWeekDraft(
        input.quarterSetting,
        effectiveStart,
        effectiveEnd,
        fullWeekEnd,
        weekNo,
        sequenceNo,
        input.forecastRun,
      );
      weeks.push(forecastWeek);
      if (forecastWeek.forecastSourceKind) {
        sourceBreakdown[forecastWeek.forecastSourceKind] += 1;
      }
    }

    cursor = addDays(fullWeekStart, 7);
    sequenceNo += 1;
  }

  if (weeks.length === 0) {
    throw new Error('No FSC quarter week slots were generated for the active quarter.');
  }

  const actualWeekCount = weeks.filter((week) => week.priceKind === 'actual').length;
  const forecastWeekCount = weeks.length - actualWeekCount;
  const quarterAverageKrwPerL = averageDecimals(weeks.map((week) => week.priceKrwPerL));
  const fallbackWeekCount =
    sourceBreakdown.carry_forward + sourceBreakdown.applied_price_fallback + sourceBreakdown.base_price_fallback;

  return {
    weeks,
    actualWeekCount,
    forecastWeekCount,
    quarterAverageKrwPerL,
    calculationPayload: {
      actualWeekCount,
      forecastWeekCount,
      sourceBreakdown,
      fallbackSummary: {
        weekCount: fallbackWeekCount,
        ratio: weeks.length === 0 ? '0.000000' : (fallbackWeekCount / weeks.length).toFixed(6),
      },
    },
  };
}
