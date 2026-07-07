import { buildMonthlySeries } from "./build-monthly-series";
import { buildWeeklySeries } from "./build-weekly-series";
import {
  NATIONAL_AVERAGE_DATASET_KEY,
  NATIONAL_AVERAGE_MARKET_SCOPE,
  type AggregateDailyPoint,
  type AggregateDailySeries,
  type AggregateDailyTruthPoint,
  type AggregateSeriesSnapshot,
  type BuildSeriesSnapshotInput,
} from "./types";

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

function formatUtcTimestamp(input: Date | string): string {
  if (input instanceof Date) {
    return input.toISOString();
  }

  const parsed = new Date(input);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Expected a valid timestamp value, received '${input}'.`);
  }

  return parsed.toISOString();
}

interface NormalizedDailySnapshotPoint extends AggregateDailyPoint {
  datasetKey?: string;
}

function normalizeDailyPoints(
  dailyTruth: ReadonlyArray<AggregateDailyTruthPoint>,
  preferredDatasetKey?: string,
): AggregateDailySeries {
  const normalized: NormalizedDailySnapshotPoint[] = dailyTruth
    .map((point) => ({
      periodKind: "daily" as const,
      priceDate: formatUtcDate(toUtcDateOnly(point.priceDate)),
      observedPriceKrwPerL: point.observedPriceKrwPerL,
      currentRevisionId: point.currentRevisionId ?? null,
      latestRecomputeSnapshotId: point.latestRecomputeSnapshotId ?? null,
      datasetKey: point.datasetKey,
    }))
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].priceDate === normalized[index].priceDate) {
      throw new Error(`Duplicate daily truth priceDate '${normalized[index].priceDate}' received.`);
    }
  }

  const datasetKey = preferredDatasetKey ?? normalized[0]?.datasetKey ?? NATIONAL_AVERAGE_DATASET_KEY;

  for (const point of normalized) {
    if (point.datasetKey && point.datasetKey !== datasetKey) {
      throw new Error(
        `Series snapshot received mixed dataset keys: expected '${datasetKey}', received '${point.datasetKey}'.`,
      );
    }
  }

  return {
    datasetKey,
    marketScope: NATIONAL_AVERAGE_MARKET_SCOPE,
    points: normalized.map(({ datasetKey: _datasetKey, ...point }) => point),
  };
}

export function buildSeriesSnapshot(input: BuildSeriesSnapshotInput): AggregateSeriesSnapshot {
  const daily = normalizeDailyPoints(input.dailyTruth, input.datasetKey);
  const weekly = buildWeeklySeries({
    dailyTruth: input.dailyTruth,
    datasetKey: daily.datasetKey,
  });
  const monthly = buildMonthlySeries({
    dailyTruth: input.dailyTruth,
    datasetKey: daily.datasetKey,
  });
  const latestDailyPoint = daily.points[daily.points.length - 1] ?? null;

  return {
    datasetKey: daily.datasetKey,
    marketScope: NATIONAL_AVERAGE_MARKET_SCOPE,
    currentTruthCutoffAt: input.currentTruthCutoffAt ? formatUtcTimestamp(input.currentTruthCutoffAt) : null,
    coverageStartDate: daily.points[0]?.priceDate ?? null,
    coverageEndDate: latestDailyPoint?.priceDate ?? null,
    latestObservedPriceKrwPerL: latestDailyPoint?.observedPriceKrwPerL ?? null,
    counts: {
      daily: daily.points.length,
      weekly: weekly.points.length,
      monthly: monthly.points.length,
    },
    latest: {
      daily: latestDailyPoint,
      weekly: weekly.points[weekly.points.length - 1] ?? null,
      monthly: monthly.points[monthly.points.length - 1] ?? null,
    },
    daily,
    weekly,
    monthly,
  };
}
