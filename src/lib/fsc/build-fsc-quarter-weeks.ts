import { getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

import { Prisma, type QuarterSetting } from '@prisma/client';

import type {
  BuildFscQuarterWeeksResult,
  FscActualSourceBreakdown,
  FscMonthlyBasisSummary,
  FscQuarterAverageBasis,
  FscQuarterWeekDraft,
  FscSourceDailyPriceRow,
  FscSourceForecastPointRow,
  FscSourceForecastRunRecord,
  FscSourceOfficialMonthlyPriceRow,
  FscSourceOfficialWeeklyPriceRow,
  FscSourceOfficialQuarterlyPriceRow,
} from './types';

const ROUND_HALF_UP = Prisma.Decimal.ROUND_HALF_UP;
const ZERO = new Prisma.Decimal(0);
const WEEK_MS = 604_800_000;

type QuarterSettingInput = Pick<
  QuarterSetting,
  | 'targetYear'
  | 'targetQuarter'
  | 'referenceYear'
  | 'referenceQuarter'
  | 'quarterStartDate'
  | 'quarterEndDate'
  | 'basePriceKrwPerL'
  | 'appliedPriceKrwPerL'
>;

export interface BuildFscQuarterWeeksInput {
  quarterSetting: QuarterSettingInput;
  currentTruthCutoffAt: Date | null;
  dailyPrices: readonly FscSourceDailyPriceRow[];
  officialWeeklyPrices: readonly FscSourceOfficialWeeklyPriceRow[];
  officialMonthlyPrices: readonly FscSourceOfficialMonthlyPriceRow[];
  officialQuarterlyPrices: readonly FscSourceOfficialQuarterlyPriceRow[];
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

function resolveLatestDailyPriceDate(dailyPrices: readonly FscSourceDailyPriceRow[]): Date | null {
  if (dailyPrices.length === 0) {
    return null;
  }

  return dailyPrices.reduce<Date | null>((latest, row) => {
    const priceDate = toDateOnly(row.priceDate);

    if (latest === null || priceDate.getTime() > latest.getTime()) {
      return priceDate;
    }

    return latest;
  }, null);
}

function overlapDays(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date): number {
  const start = clampStart(leftStart, rightStart);
  const end = clampEnd(leftEnd, rightEnd);

  if (start.getTime() > end.getTime()) {
    return 0;
  }

  return daysInclusive(start, end);
}

function formatDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}



function getIsoWeekNumber(value: Date): number {
  const thursday = getOpinetWeekEnd(value);
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

function buildWeeklyForecastSeries(points: readonly FscSourceForecastPointRow[]): {
  points: FscSourceForecastPointRow[];
  index: Map<string, FscSourceForecastPointRow>;
} {
  const index = new Map<string, FscSourceForecastPointRow>();

  for (const point of points) {
    if (point.horizonKind === 'weekly') {
      index.set(formatDateKey(toDateOnly(point.targetDate)), point);
    }
  }

  const weeklyPoints = [...index.values()].sort(
    (left, right) => left.targetDate.getTime() - right.targetDate.getTime(),
  );

  return {
    points: weeklyPoints,
    index,
  };
}

function calculateWeeklyTrendExtension(
  points: readonly FscSourceForecastPointRow[],
  targetDate: Date,
): { priceKrwPerL: Prisma.Decimal; sourcePriceDate: Date } | null {
  let previousPoint: FscSourceForecastPointRow | null = null;
  let latestPoint: FscSourceForecastPointRow | null = null;
  let totalWeeklyChange = ZERO;
  let weeklyChangeCount = 0;

  for (const point of points) {
    const pointDate = toDateOnly(point.targetDate);

    if (pointDate.getTime() >= targetDate.getTime()) {
      break;
    }

    if (previousPoint) {
      const elapsedWeeks =
        (pointDate.getTime() - toDateOnly(previousPoint.targetDate).getTime()) / WEEK_MS;

      if (elapsedWeeks > 0) {
        totalWeeklyChange = totalWeeklyChange.plus(
          point.pointKrwPerL.minus(previousPoint.pointKrwPerL).dividedBy(elapsedWeeks),
        );
        weeklyChangeCount += 1;
      }
    }

    previousPoint = point;
    latestPoint = point;
  }

  if (latestPoint === null || weeklyChangeCount === 0) {
    return null;
  }

  const elapsedWeeks =
    (targetDate.getTime() - toDateOnly(latestPoint.targetDate).getTime()) / WEEK_MS;

  if (elapsedWeeks <= 0) {
    return null;
  }

  const averageWeeklyChange = totalWeeklyChange.dividedBy(weeklyChangeCount);

  return {
    priceKrwPerL: latestPoint.pointKrwPerL.plus(averageWeeklyChange.times(elapsedWeeks)),
    sourcePriceDate: latestPoint.targetDate,
  };
}

function findOfficialWeeklyMatch(
  officialWeeklyPrices: readonly FscSourceOfficialWeeklyPriceRow[],
  effectiveStart: Date,
  effectiveEnd: Date,
): FscSourceOfficialWeeklyPriceRow | null {
  let bestMatch: FscSourceOfficialWeeklyPriceRow | null = null;
  let bestOverlap = 0;
  const preferredMonth = effectiveEnd.getUTCMonth() + 1;

  for (const row of officialWeeklyPrices) {
    const overlap = overlapDays(effectiveStart, effectiveEnd, row.weekStartDate, row.weekEndDate);

    if (overlap <= 0) {
      continue;
    }

    const rowMonth = Number(row.weekKey.slice(4, 6));
    const rowMatchesPreferredMonth = rowMonth === preferredMonth;
    const bestMatchesPreferredMonth = bestMatch ? Number(bestMatch.weekKey.slice(4, 6)) === preferredMonth : false;

    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && rowMatchesPreferredMonth && !bestMatchesPreferredMonth) ||
      (overlap === bestOverlap && rowMatchesPreferredMonth === bestMatchesPreferredMonth && bestMatch !== null && row.fetchedAt.getTime() > bestMatch.fetchedAt.getTime()) ||
      (overlap === bestOverlap && bestMatch === null)
    ) {
      bestMatch = row;
      bestOverlap = overlap;
    }
  }

  return bestMatch;
}

function resolvePreviousWeekBasis(
  quarterStartDate: Date,
  dailyPriceMap: ReadonlyMap<string, FscSourceDailyPriceRow>,
  officialWeeklyPrices: readonly FscSourceOfficialWeeklyPriceRow[],
): {
  weekStartDate: Date;
  weekEndDate: Date;
  priceKrwPerL: Prisma.Decimal;
  sourceKind: 'official_weekly' | 'daily_average';
} | null {
  const firstFullWeekStart = getOpinetWeekStart(quarterStartDate);
  const previousWeekStart = addDays(firstFullWeekStart, -7);
  const previousWeekEnd = getOpinetWeekEnd(previousWeekStart);
  const officialWeeklyMatch = findOfficialWeeklyMatch(
    officialWeeklyPrices,
    previousWeekStart,
    previousWeekEnd,
  );

  if (officialWeeklyMatch) {
    return {
      weekStartDate: previousWeekStart,
      weekEndDate: previousWeekEnd,
      priceKrwPerL: roundPrice(officialWeeklyMatch.priceKrwPerL),
      sourceKind: 'official_weekly',
    };
  }

  const dailyPrices: Prisma.Decimal[] = [];

  for (
    let day = new Date(previousWeekStart);
    day.getTime() <= previousWeekEnd.getTime();
    day = addDays(day, 1)
  ) {
    const row = dailyPriceMap.get(formatDateKey(day));
    if (row) {
      dailyPrices.push(row.observedPriceKrwPerL);
    }
  }

  if (dailyPrices.length !== daysInclusive(previousWeekStart, previousWeekEnd)) {
    return null;
  }

  return {
    weekStartDate: previousWeekStart,
    weekEndDate: previousWeekEnd,
    priceKrwPerL: averageDecimals(dailyPrices),
    sourceKind: 'daily_average',
  };
}

function getQuarterMonths(quarter: number): [number, number, number] {
  if (quarter === 1) return [1, 2, 3];
  if (quarter === 2) return [4, 5, 6];
  if (quarter === 3) return [7, 8, 9];
  return [10, 11, 12];
}

function buildMonthlyBasisSummary(
  quarterSetting: QuarterSettingInput,
  officialMonthlyPrices: readonly FscSourceOfficialMonthlyPriceRow[],
): FscMonthlyBasisSummary | null {
  const quarterMonths = getQuarterMonths(quarterSetting.referenceQuarter);
  const monthKeys = new Set(
    quarterMonths.map((month) => `${quarterSetting.referenceYear}${String(month).padStart(2, '0')}`),
  );
  const monthRows = officialMonthlyPrices
    .filter((row) => monthKeys.has(row.monthKey))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .map((row) => ({
      monthKey: row.monthKey,
      monthLabel: row.monthLabel,
      priceKrwPerL: row.priceKrwPerL,
    }));

  if (monthRows.length === 0) {
    return null;
  }

  return {
    referenceYear: quarterSetting.referenceYear,
    referenceQuarter: quarterSetting.referenceQuarter,
    monthRows,
    quarterAverageKrwPerL:
      monthRows.length === 3 ? averageDecimals(monthRows.map((row) => row.priceKrwPerL)) : null,
  };
}

function isCompletedQuarter(quarterEndDate: Date, currentTruthCutoffAt: Date | null): boolean {
  if (currentTruthCutoffAt === null) {
    return false;
  }

  return quarterEndDate.getTime() < toDateOnly(currentTruthCutoffAt).getTime();
}

function resolveQuarterAverage(input: {
  quarterSetting: QuarterSettingInput;
  quarterEndDate: Date;
  currentTruthCutoffAt: Date | null;
  officialQuarterlyPrices: readonly FscSourceOfficialQuarterlyPriceRow[];
  officialMonthlyPrices: readonly FscSourceOfficialMonthlyPriceRow[];
  weeklyAverageKrwPerL: Prisma.Decimal | null;
}): { quarterAverageKrwPerL: Prisma.Decimal; basis: FscQuarterAverageBasis } {
  const quarterKey = `${input.quarterSetting.targetYear}Q${input.quarterSetting.targetQuarter}`;

  if (!isCompletedQuarter(input.quarterEndDate, input.currentTruthCutoffAt)) {
    if (input.weeklyAverageKrwPerL === null) {
      throw new Error('No valid actual or weekly forecast prices are available for FSC calculation.');
    }

    return {
      quarterAverageKrwPerL: input.weeklyAverageKrwPerL,
      basis: {
        kind: 'weekly_actual_forecast',
        quarterKey,
        sourceLabel: null,
        weeklyAverageKrwPerL: input.weeklyAverageKrwPerL,
      },
    };
  }

  const officialQuarterly = input.officialQuarterlyPrices.find((row) => row.quarterKey === quarterKey);

  if (officialQuarterly) {
    return {
      quarterAverageKrwPerL: roundPrice(officialQuarterly.priceKrwPerL),
      basis: {
        kind: 'official_quarterly',
        quarterKey,
        sourceLabel: officialQuarterly.quarterLabel,
        weeklyAverageKrwPerL: input.weeklyAverageKrwPerL,
      },
    };
  }

  const quarterMonthKeys = new Set(
    getQuarterMonths(input.quarterSetting.targetQuarter).map(
      (month) => `${input.quarterSetting.targetYear}${String(month).padStart(2, '0')}`,
    ),
  );
  const officialMonthRows = input.officialMonthlyPrices
    .filter((row) => quarterMonthKeys.has(row.monthKey))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));

  if (officialMonthRows.length === 3) {
    return {
      quarterAverageKrwPerL: averageDecimals(officialMonthRows.map((row) => row.priceKrwPerL)),
      basis: {
        kind: 'official_monthly_average',
        quarterKey,
        sourceLabel: officialMonthRows.map((row) => row.monthLabel).join(', '),
        weeklyAverageKrwPerL: input.weeklyAverageKrwPerL,
      },
    };
  }

  throw new Error(
    `Official Opinet quarterly average is unavailable for completed quarter ${quarterKey}; weekly averages must not substitute it.`,
  );
}

function createForecastWeekDraft(
  quarterSetting: QuarterSettingInput,
  effectiveStart: Date,
  effectiveEnd: Date,
  fullWeekEnd: Date,
  weekNo: number,
  sequenceNo: number,
  weeklyForecastPoints: readonly FscSourceForecastPointRow[],
  weeklyForecastIndex: ReadonlyMap<string, FscSourceForecastPointRow>,
): FscQuarterWeekDraft {
  const weeklyMatch = weeklyForecastIndex.get(formatDateKey(fullWeekEnd)) ?? null;
  const trendExtension =
    weeklyMatch === null ? calculateWeeklyTrendExtension(weeklyForecastPoints, fullWeekEnd) : null;

  let sourceKind: FscQuarterWeekDraft['forecastSourceKind'] = null;
  let sourcePoint: FscSourceForecastPointRow | null = null;
  let priceKrwPerL: Prisma.Decimal | null = null;
  let sourcePriceDate: Date | null = null;

  if (weeklyMatch) {
    sourceKind = 'weekly_point';
    sourcePoint = weeklyMatch;
    priceKrwPerL = weeklyMatch.pointKrwPerL;
    sourcePriceDate = weeklyMatch.targetDate;
  } else if (trendExtension) {
    sourceKind = 'weekly_trend_extension';
    priceKrwPerL = trendExtension.priceKrwPerL;
    sourcePriceDate = trendExtension.sourcePriceDate;
  }

  const roundedPrice = priceKrwPerL === null ? null : roundPrice(priceKrwPerL);
  const priceDiffKrwPerL =
    roundedPrice === null ? null : roundPrice(roundedPrice.minus(quarterSetting.basePriceKrwPerL));
  const diffRatio =
    priceDiffKrwPerL === null
      ? null
      : roundRatio(priceDiffKrwPerL.dividedBy(quarterSetting.basePriceKrwPerL));

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
    forecastLowerBoundKrwPerL:
      weeklyMatch?.lowerBoundKrwPerL === null || weeklyMatch?.lowerBoundKrwPerL === undefined
        ? null
        : roundPrice(weeklyMatch.lowerBoundKrwPerL),
    forecastUpperBoundKrwPerL:
      weeklyMatch?.upperBoundKrwPerL === null || weeklyMatch?.upperBoundKrwPerL === undefined
        ? null
        : roundPrice(weeklyMatch.upperBoundKrwPerL),
    sourcePriceDate,
    sourceRevisionIds: null,
    forecastPointId: sourcePoint?.id ?? null,
    forecastSourceKind: sourceKind,
    fallbackUsed: false,
    basePriceKrwPerL: quarterSetting.basePriceKrwPerL,
    priceDiffKrwPerL,
    diffRatio,
  };
}

export function buildFscQuarterWeeks(input: BuildFscQuarterWeeksInput): BuildFscQuarterWeeksResult {
  const quarterStartDate = toDateOnly(input.quarterSetting.quarterStartDate);
  const quarterEndDate = toDateOnly(input.quarterSetting.quarterEndDate);
  const latestDailyPriceDate = resolveLatestDailyPriceDate(input.dailyPrices);
  const dailyPriceMap = new Map(input.dailyPrices.map((row) => [formatDateKey(toDateOnly(row.priceDate)), row]));
  const previousWeekBasis = resolvePreviousWeekBasis(
    quarterStartDate,
    dailyPriceMap,
    input.officialWeeklyPrices,
  );
  const weeklyForecastSeries = buildWeeklyForecastSeries(input.forecastRun?.points ?? []);

  const weeks: FscQuarterWeekDraft[] = [];
  const basePriceKrwPerL = input.quarterSetting.basePriceKrwPerL;
  const sourceBreakdown = {
    actual: 0,
    weekly_point: 0,
    weekly_trend_extension: 0,
    forecast_pending: 0,
  };
  const actualSourceBreakdown: FscActualSourceBreakdown = {
    officialWeekly: 0,
    dailyAverage: 0,
  };

  let cursor = getOpinetWeekStart(quarterStartDate);
  let sequenceNo = 1;

  while (cursor.getTime() <= quarterEndDate.getTime()) {
    const fullWeekStart = cursor;
    const fullWeekEnd = getOpinetWeekEnd(fullWeekStart);
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
    const officialWeeklyMatch = findOfficialWeeklyMatch(input.officialWeeklyPrices, effectiveStart, effectiveEnd);
    const hasCompletedDailyActual =
      latestDailyPriceDate !== null &&
      effectiveEnd.getTime() <= latestDailyPriceDate.getTime() &&
      slotRows.length === expectedDayCount;
    const hasPublishedOfficialWeeklyActual = officialWeeklyMatch !== null;

    if (hasCompletedDailyActual || hasPublishedOfficialWeeklyActual) {
      const actualPriceKrwPerL = officialWeeklyMatch
        ? roundPrice(officialWeeklyMatch.priceKrwPerL)
        : averageDecimals(slotRows.map((row) => row.observedPriceKrwPerL));
      const priceDiffKrwPerL = roundPrice(actualPriceKrwPerL.minus(basePriceKrwPerL));
      const diffRatio = roundRatio(priceDiffKrwPerL.dividedBy(basePriceKrwPerL));

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
        forecastLowerBoundKrwPerL: null,
        forecastUpperBoundKrwPerL: null,
        sourcePriceDate: officialWeeklyMatch?.weekEndDate ?? slotRows[slotRows.length - 1]?.priceDate ?? null,
        sourceRevisionIds: slotRows.map((row) => row.currentRevisionId),
        forecastPointId: null,
        forecastSourceKind: null,
        fallbackUsed: false,
        basePriceKrwPerL,
        priceDiffKrwPerL,
        diffRatio,
      });
      sourceBreakdown.actual += 1;
      if (officialWeeklyMatch) {
        actualSourceBreakdown.officialWeekly += 1;
      } else {
        actualSourceBreakdown.dailyAverage += 1;
      }
    } else {
      const forecastWeek = createForecastWeekDraft(
        input.quarterSetting,
        effectiveStart,
        effectiveEnd,
        fullWeekEnd,
        weekNo,
        sequenceNo,
        weeklyForecastSeries.points,
        weeklyForecastSeries.index,
      );
      weeks.push(forecastWeek);
      if (forecastWeek.forecastSourceKind) {
        sourceBreakdown[forecastWeek.forecastSourceKind] += 1;
      } else {
        sourceBreakdown.forecast_pending += 1;
      }
    }

    cursor = addDays(fullWeekStart, 7);
    sequenceNo += 1;
  }

  if (weeks.length === 0) {
    throw new Error('No FSC quarter week slots were generated for the active quarter.');
  }

  let actualWeekCount = 0;
  let forecastWeekCount = 0;
  const validWeekPrices: Prisma.Decimal[] = [];

  for (const week of weeks) {
    if (week.priceKind === 'actual') {
      actualWeekCount += 1;
    } else if (week.priceKrwPerL !== null) {
      forecastWeekCount += 1;
    }

    if (week.priceKrwPerL !== null) {
      validWeekPrices.push(week.priceKrwPerL);
    }
  }

  const weeklyAverageKrwPerL = validWeekPrices.length > 0 ? averageDecimals(validWeekPrices) : null;
  const { quarterAverageKrwPerL, basis: quarterAverageBasis } = resolveQuarterAverage({
    quarterSetting: input.quarterSetting,
    quarterEndDate,
    currentTruthCutoffAt: input.currentTruthCutoffAt,
    officialQuarterlyPrices: input.officialQuarterlyPrices,
    officialMonthlyPrices: input.officialMonthlyPrices,
    weeklyAverageKrwPerL,
  });
  const monthlyBasis = buildMonthlyBasisSummary(input.quarterSetting, input.officialMonthlyPrices);

  return {
    weeks,
    actualWeekCount,
    forecastWeekCount,
    quarterAverageKrwPerL,
    quarterAverageBasis,
    monthlyBasis,
    calculationPayload: {
      actualWeekCount,
      forecastWeekCount,
      actualSourceBreakdown: {
        officialWeekly: actualSourceBreakdown.officialWeekly,
        dailyAverage: actualSourceBreakdown.dailyAverage,
      },
      sourceBreakdown,
      pendingForecastWeekCount: sourceBreakdown.forecast_pending,
      quarterAverageBasis: {
        kind: quarterAverageBasis.kind,
        quarterKey: quarterAverageBasis.quarterKey,
        sourceLabel: quarterAverageBasis.sourceLabel,
        quarterAverageKrwPerL: quarterAverageKrwPerL.toFixed(3),
        weeklyAverageKrwPerL: quarterAverageBasis.weeklyAverageKrwPerL?.toFixed(3) ?? null,
      },
      monthlyBasis:
        monthlyBasis === null
          ? null
          : {
              referenceYear: monthlyBasis.referenceYear,
              referenceQuarter: monthlyBasis.referenceQuarter,
              quarterAverageKrwPerL: monthlyBasis.quarterAverageKrwPerL?.toFixed(3) ?? null,
              monthRows: monthlyBasis.monthRows.map((row) => ({
                monthKey: row.monthKey,
                monthLabel: row.monthLabel,
                priceKrwPerL: row.priceKrwPerL.toFixed(3),
              })),
            },
      previousWeekBasis:
        previousWeekBasis === null
          ? null
          : {
              weekStartDate: formatDateKey(previousWeekBasis.weekStartDate),
              weekEndDate: formatDateKey(previousWeekBasis.weekEndDate),
              priceKrwPerL: previousWeekBasis.priceKrwPerL.toFixed(3),
              sourceKind: previousWeekBasis.sourceKind,
            },
    } as Prisma.InputJsonValue,
  };
}
