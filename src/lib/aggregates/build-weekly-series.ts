import {
  NATIONAL_AVERAGE_DATASET_KEY,
  NATIONAL_AVERAGE_MARKET_SCOPE,
  type AggregateDailyTruthPoint,
  type BuildAggregateSeriesInput,
  type WeeklyAggregatePoint,
  type WeeklyAggregateSeries,
} from "./types";

interface NormalizedDailyTruthPoint {
  priceDate: string;
  observedPriceKrwPerL: number;
  datasetKey?: string;
}

function toUtcDateOnly(input: Date | string): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);

  if (!match) {
    throw new Error(`Expected an ISO-like date value, received '${input}'.`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  return new Date(Date.UTC(year, monthIndex, day));
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDailyTruth(dailyTruth: ReadonlyArray<AggregateDailyTruthPoint>): NormalizedDailyTruthPoint[] {
  const normalized = dailyTruth.map((point) => ({
    priceDate: formatUtcDate(toUtcDateOnly(point.priceDate)),
    observedPriceKrwPerL: point.observedPriceKrwPerL,
    datasetKey: point.datasetKey,
  }));

  normalized.sort((left, right) => left.priceDate.localeCompare(right.priceDate));

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].priceDate === normalized[index].priceDate) {
      throw new Error(`Duplicate daily truth priceDate '${normalized[index].priceDate}' received.`);
    }
  }

  return normalized;
}

function resolveDatasetKey(
  normalized: ReadonlyArray<NormalizedDailyTruthPoint>,
  preferredDatasetKey?: string,
): string {
  const resolved = preferredDatasetKey ?? normalized[0]?.datasetKey ?? NATIONAL_AVERAGE_DATASET_KEY;

  for (const point of normalized) {
    if (point.datasetKey && point.datasetKey !== resolved) {
      throw new Error(
        `Weekly aggregation received mixed dataset keys: expected '${resolved}', received '${point.datasetKey}'.`,
      );
    }
  }

  return resolved;
}

function getIsoWeekParts(date: Date): { isoWeekYear: number; isoWeek: number; weekStart: Date; weekEnd: Date } {
  const utcDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - (utcDay - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const thursday = new Date(weekStart);
  thursday.setUTCDate(weekStart.getUTCDate() + 3);
  const isoWeekYear = thursday.getUTCFullYear();

  const firstThursday = new Date(Date.UTC(isoWeekYear, 0, 4));
  const firstThursdayUtcDay = firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - firstThursdayUtcDay));

  const diffMs = thursday.getTime() - firstThursday.getTime();
  const weekIndex = Math.round(diffMs / 604800000);
  const isoWeek = weekIndex + 1;

  return {
    isoWeekYear,
    isoWeek,
    weekStart,
    weekEnd,
  };
}

function createWeeklyPoint(
  weekKey: string,
  isoWeekYear: number,
  isoWeek: number,
  weekStart: Date,
  weekEnd: Date,
  prices: number[],
): WeeklyAggregatePoint {
  const openingPriceKrwPerL = prices[0];
  const closingPriceKrwPerL = prices[prices.length - 1];
  const minPriceKrwPerL = Math.min(...prices);
  const maxPriceKrwPerL = Math.max(...prices);
  const sum = prices.reduce((total, value) => total + value, 0);
  const averagePriceKrwPerL = sum / prices.length;
  const absoluteChangeKrwPerL = closingPriceKrwPerL - openingPriceKrwPerL;
  const percentChangeFromOpen = openingPriceKrwPerL === 0 ? null : (absoluteChangeKrwPerL / openingPriceKrwPerL) * 100;

  return {
    periodKind: "weekly",
    weekKey,
    isoWeekYear,
    isoWeek,
    weekStartDate: formatUtcDate(weekStart),
    weekEndDate: formatUtcDate(weekEnd),
    sampleCount: prices.length,
    averagePriceKrwPerL,
    openingPriceKrwPerL,
    closingPriceKrwPerL,
    minPriceKrwPerL,
    maxPriceKrwPerL,
    absoluteChangeKrwPerL,
    percentChangeFromOpen,
  };
}

export function buildWeeklySeries(input: BuildAggregateSeriesInput): WeeklyAggregateSeries {
  const normalized = normalizeDailyTruth(input.dailyTruth);
  const datasetKey = resolveDatasetKey(normalized, input.datasetKey);
  const points: WeeklyAggregatePoint[] = [];

  let activeWeekKey: string | null = null;
  let activeIsoWeekYear = 0;
  let activeIsoWeek = 0;
  let activeWeekStart: Date | null = null;
  let activeWeekEnd: Date | null = null;
  let activePrices: number[] = [];

  for (const point of normalized) {
    const date = toUtcDateOnly(point.priceDate);
    const { isoWeekYear, isoWeek, weekStart, weekEnd } = getIsoWeekParts(date);
    const weekKey = `${isoWeekYear}-W${String(isoWeek).padStart(2, "0")}`;

    if (activeWeekKey !== null && weekKey !== activeWeekKey) {
      points.push(
        createWeeklyPoint(activeWeekKey, activeIsoWeekYear, activeIsoWeek, activeWeekStart as Date, activeWeekEnd as Date, activePrices),
      );
      activePrices = [];
    }

    activeWeekKey = weekKey;
    activeIsoWeekYear = isoWeekYear;
    activeIsoWeek = isoWeek;
    activeWeekStart = weekStart;
    activeWeekEnd = weekEnd;
    activePrices.push(point.observedPriceKrwPerL);
  }

  if (activeWeekKey !== null && activeWeekStart && activeWeekEnd && activePrices.length > 0) {
    points.push(createWeeklyPoint(activeWeekKey, activeIsoWeekYear, activeIsoWeek, activeWeekStart, activeWeekEnd, activePrices));
  }

  return {
    datasetKey,
    marketScope: NATIONAL_AVERAGE_MARKET_SCOPE,
    points,
  };
}
