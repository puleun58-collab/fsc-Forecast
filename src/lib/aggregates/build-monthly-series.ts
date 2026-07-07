import {
  NATIONAL_AVERAGE_DATASET_KEY,
  NATIONAL_AVERAGE_MARKET_SCOPE,
  type AggregateDailyTruthPoint,
  type BuildAggregateSeriesInput,
  type MonthlyAggregatePoint,
  type MonthlyAggregateSeries,
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
        `Monthly aggregation received mixed dataset keys: expected '${resolved}', received '${point.datasetKey}'.`,
      );
    }
  }

  return resolved;
}

function createMonthlyPoint(year: number, month: number, prices: number[]): MonthlyAggregatePoint {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const openingPriceKrwPerL = prices[0];
  const closingPriceKrwPerL = prices[prices.length - 1];
  const minPriceKrwPerL = Math.min(...prices);
  const maxPriceKrwPerL = Math.max(...prices);
  const sum = prices.reduce((total, value) => total + value, 0);
  const averagePriceKrwPerL = sum / prices.length;
  const absoluteChangeKrwPerL = closingPriceKrwPerL - openingPriceKrwPerL;
  const percentChangeFromOpen = openingPriceKrwPerL === 0 ? null : (absoluteChangeKrwPerL / openingPriceKrwPerL) * 100;

  return {
    periodKind: "monthly",
    monthKey: `${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    monthStartDate: formatUtcDate(monthStart),
    monthEndDate: formatUtcDate(monthEnd),
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

export function buildMonthlySeries(input: BuildAggregateSeriesInput): MonthlyAggregateSeries {
  const normalized = normalizeDailyTruth(input.dailyTruth);
  const datasetKey = resolveDatasetKey(normalized, input.datasetKey);
  const points: MonthlyAggregatePoint[] = [];

  let activeYear: number | null = null;
  let activeMonth: number | null = null;
  let activePrices: number[] = [];

  for (const point of normalized) {
    const date = toUtcDateOnly(point.priceDate);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    if (activeYear !== null && activeMonth !== null && (year !== activeYear || month !== activeMonth)) {
      points.push(createMonthlyPoint(activeYear, activeMonth, activePrices));
      activePrices = [];
    }

    activeYear = year;
    activeMonth = month;
    activePrices.push(point.observedPriceKrwPerL);
  }

  if (activeYear !== null && activeMonth !== null && activePrices.length > 0) {
    points.push(createMonthlyPoint(activeYear, activeMonth, activePrices));
  }

  return {
    datasetKey,
    marketScope: NATIONAL_AVERAGE_MARKET_SCOPE,
    points,
  };
}
