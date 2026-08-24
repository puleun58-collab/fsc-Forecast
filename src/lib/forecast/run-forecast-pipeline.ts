import {
  OPINET_WEEKLY_COLLECTION_DAY_COUNT,
  getOpinetWeekEnd,
  getOpinetWeekStart,
  isOpinetWeeklyCollectionDay,
} from "../opinet/weekly-period";

import {
  ForecastApprovalState,
  ForecastHorizonKind,
  RunStatus,
  type Prisma,
} from "@prisma/client";

import { db } from "../db";
import { externalIndicatorCodes } from "../external-indicators/catalog";
import { env } from "../env";
import { loadPublicConfirmedLatestDate } from "../opinet/resolve-public-confirmed-date";
import { buildBaselineForecast } from "./build-baseline-forecast";
import { evaluateMapeGate } from "./evaluate-mape-gate";
import { loadOpinetQ2FallbackSeries } from "./load-opinet-q2-fallback";
import {
  FORECAST_BACKTEST_WEEKS,
  FORECAST_MAPE_THRESHOLD_PCT,
  FORECAST_MONTHLY_HORIZON_COUNT,
  FORECAST_WEEKLY_HORIZON_COUNT,
  type ForecastDailyPriceRow,
  type ForecastIndicatorSnapshot,
  type ForecastProjectionPoint,
  type ForecastRunRecord,
  type ForecastSeriesPoint,
  type RunForecastPipelineInput,
  type RunForecastPipelineResult,
} from "./types";

interface DailyPriceCurrentRow {
  priceDate: Date;
  currentRevisionId: string;
  currentRevision: {
    observedPriceKrwPerL: Prisma.Decimal;
  };
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function filterDailyPricesByConfirmedDate(
  dailyPrices: readonly ForecastDailyPriceRow[],
  latestConfirmedDate: Date | null,
): ForecastDailyPriceRow[] {
  if (latestConfirmedDate === null) {
    return [...dailyPrices];
  }

  return dailyPrices.filter((row) => toDateOnly(row.priceDate).getTime() <= latestConfirmedDate.getTime());
}


function getUtcMonthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function getUtcMonthEnd(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function createSeriesPoint(
  horizonKind: ForecastHorizonKind,
  periodStart: Date,
  periodEnd: Date,
  values: number[],
): ForecastSeriesPoint {
  return {
    horizonKind,
    periodStart,
    periodEnd,
    targetDate: periodEnd,
    pointKrwPerL: roundPrice(values.reduce((sum, value) => sum + value, 0) / values.length),
    sampleCount: values.length,
  };
}

function aggregateDailyPrices(
  dailyPrices: readonly ForecastDailyPriceRow[],
  horizonKind: ForecastHorizonKind,
): ForecastSeriesPoint[] {
  const groups = new Map<string, { periodStart: Date; periodEnd: Date; values: number[] }>();

  for (const row of dailyPrices) {
    if (horizonKind === "weekly" && !isOpinetWeeklyCollectionDay(row.priceDate)) {
      continue;
    }

    const periodStart = horizonKind === "weekly" ? getOpinetWeekStart(row.priceDate) : getUtcMonthStart(row.priceDate);
    const periodEnd = horizonKind === "weekly" ? getOpinetWeekEnd(row.priceDate) : getUtcMonthEnd(row.priceDate);
    const key = periodEnd.toISOString();
    const existing = groups.get(key);

    if (existing) {
      existing.values.push(row.observedPriceKrwPerL);
      continue;
    }

    groups.set(key, {
      periodStart,
      periodEnd,
      values: [row.observedPriceKrwPerL],
    });
  }

  const series = [...groups.values()]
    .sort((left, right) => left.periodEnd.getTime() - right.periodEnd.getTime())
    .map((group) => createSeriesPoint(horizonKind, group.periodStart, group.periodEnd, group.values));

  return horizonKind === "weekly"
    ? series.filter((point) => point.sampleCount === OPINET_WEEKLY_COLLECTION_DAY_COUNT)
    : series;
}

function normalizeDailyPriceRows(rows: readonly DailyPriceCurrentRow[]): ForecastDailyPriceRow[] {
  return rows.map((row) => ({
    priceDate: row.priceDate,
    observedPriceKrwPerL: Number(row.currentRevision.observedPriceKrwPerL),
    currentRevisionId: row.currentRevisionId,
  }));
}

async function loadDailyPrices(
  tx: Prisma.TransactionClient,
  recomputeSnapshotId: string,
): Promise<ForecastDailyPriceRow[]> {
  const rows = await tx.dailyPriceCurrent.findMany({
    where: {
      datasetKey: env.datasetKey,
      latestRecomputeSnapshotId: recomputeSnapshotId,
    },
    orderBy: {
      priceDate: "asc",
    },
    include: {
      currentRevision: {
        select: {
          observedPriceKrwPerL: true,
        },
      },
    },
  });

  return normalizeDailyPriceRows(rows);
}
function mergeSeries(
  primarySeries: readonly ForecastSeriesPoint[],
  fallbackSeries: readonly ForecastSeriesPoint[],
): ForecastSeriesPoint[] {
  const merged = new Map<string, ForecastSeriesPoint>();

  for (const point of fallbackSeries) {
    merged.set(point.targetDate.toISOString(), point);
  }

  for (const point of primarySeries) {
    merged.set(point.targetDate.toISOString(), point);
  }

  return [...merged.values()].sort((left, right) => left.targetDate.getTime() - right.targetDate.getTime());
}

function shouldLoadQ2Fallback(
  dailyPrices: readonly ForecastDailyPriceRow[],
  weeklySeries: readonly ForecastSeriesPoint[],
  monthlySeries: readonly ForecastSeriesPoint[],
): boolean {
  if (dailyPrices.length === 0) {
    return false;
  }

  if (weeklySeries.length < 8 || monthlySeries.length < 3) {
    return true;
  }

  const latestYear = dailyPrices[dailyPrices.length - 1].priceDate.getUTCFullYear();
  const quarterStart = new Date(Date.UTC(latestYear, 3, 1));
  const quarterEnd = new Date(Date.UTC(latestYear, 6, 0));

  return !dailyPrices.some((row) => row.priceDate >= quarterStart && row.priceDate <= quarterEnd);
}

function resolveFallbackYear(
  dailyPrices: readonly ForecastDailyPriceRow[],
  currentTruthCutoffAt: Date | null,
): number {
  if (currentTruthCutoffAt) {
    return currentTruthCutoffAt.getUTCFullYear();
  }

  return dailyPrices[dailyPrices.length - 1].priceDate.getUTCFullYear();
}

async function loadIndicatorSnapshots(
  tx: Prisma.TransactionClient,
  currentTruthCutoffAt: Date | null,
): Promise<ForecastIndicatorSnapshot[]> {
  if (!currentTruthCutoffAt) {
    return [];
  }

  const snapshots: ForecastIndicatorSnapshot[] = [];

  for (const indicatorCode of externalIndicatorCodes) {
    const records = await tx.externalIndicatorHistory.findMany({
      where: {
        indicatorCode,
        observedAt: {
          lte: currentTruthCutoffAt,
        },
      },
      orderBy: {
        observedAt: "desc",
      },
      take: 2,
    });

    if (records.length === 0) {
      continue;
    }

    const latest = records[0];
    const previous = records[1] ?? null;
    const previousValue = previous ? Number(previous.value) : null;
    const percentChange =
      previousValue === null || previousValue === 0
        ? null
        : ((Number(latest.value) - previousValue) / previousValue) * 100;

    snapshots.push({
      indicatorCode,
      observedAt: latest.observedAt,
      value: Number(latest.value),
      previousObservedAt: previous?.observedAt ?? null,
      previousValue,
      percentChange,
    });
  }

  return snapshots;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyIndicatorAdjustment(
  points: readonly ForecastProjectionPoint[],
  indicators: readonly ForecastIndicatorSnapshot[],
  baselineLevelKrwPerL: number,
): ForecastProjectionPoint[] {
  const usableChanges = indicators
    .map((indicator) => indicator.percentChange)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (usableChanges.length === 0) {
    return [...points];
  }

  const averagePercentChange = usableChanges.reduce((sum, value) => sum + value, 0) / usableChanges.length;
  const adjustmentRatio = clampNumber((averagePercentChange / 100) * 0.15, -0.04, 0.04);

  return points.map((point) => {
    const adjustment = baselineLevelKrwPerL * adjustmentRatio * point.horizonIndex;
    const adjustedPoint = Math.max(0, point.pointKrwPerL + adjustment);
    const lowerAdjustment = point.lowerBoundKrwPerL === null ? null : Math.max(0, point.lowerBoundKrwPerL + adjustment);
    const upperAdjustment = point.upperBoundKrwPerL === null ? null : Math.max(0, point.upperBoundKrwPerL + adjustment);

    return {
      ...point,
      pointKrwPerL: roundPrice(adjustedPoint),
      lowerBoundKrwPerL: lowerAdjustment === null ? null : roundPrice(lowerAdjustment),
      upperBoundKrwPerL: upperAdjustment === null ? null : roundPrice(upperAdjustment),
    };
  });
}

function stripConfidenceBounds(points: readonly ForecastProjectionPoint[]): ForecastProjectionPoint[] {
  return points.map((point) => ({
    ...point,
    lowerBoundKrwPerL: null,
    upperBoundKrwPerL: null,
  }));
}

function toForecastRunRecord(run: {
  id: string;
  recomputeSnapshotId: string;
  status: RunStatus;
  approvalState: ForecastApprovalState;
  backtestWeeks: number | null;
  mapePct: Prisma.Decimal | null;
  maeKrwPerL: Prisma.Decimal | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorSummary: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): ForecastRunRecord {
  return {
    id: run.id,
    recomputeSnapshotId: run.recomputeSnapshotId,
    status: run.status,
    approvalState: run.approvalState,
    backtestWeeks: run.backtestWeeks,
    mapePct: run.mapePct === null ? null : Number(run.mapePct),
    maeKrwPerL: run.maeKrwPerL === null ? null : Number(run.maeKrwPerL),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    errorSummary: run.errorSummary,
    metadata: run.metadata,
    createdAt: run.createdAt,
  };
}


export async function runForecastPipeline(
  input: RunForecastPipelineInput,
): Promise<RunForecastPipelineResult> {
  const startedAt = new Date();

  if (input.tx) {
    return executeForecastPipeline(input.tx, input, startedAt);
  }

  return db.$transaction((tx) => executeForecastPipeline(tx, input, startedAt), {
    maxWait: 10_000,
    timeout: 30_000,
  });
}

async function executeForecastPipeline(
  tx: Prisma.TransactionClient,
  input: RunForecastPipelineInput,
  startedAt: Date,
): Promise<RunForecastPipelineResult> {
  const recomputeSnapshot = await tx.recomputeSnapshot.findUniqueOrThrow({
    where: {
      id: input.recomputeSnapshotId,
    },
    select: {
      id: true,
      datasetKey: true,
      status: true,
      currentTruthCutoffAt: true,
    },
  });

  if (recomputeSnapshot.datasetKey !== env.datasetKey) {
    throw new Error(
      `Forecast pipeline is locked to dataset '${env.datasetKey}', received '${recomputeSnapshot.datasetKey}'.`,
    );
  }

  if (recomputeSnapshot.status !== RunStatus.succeeded) {
    throw new Error(
      `Forecast pipeline requires a successful recompute snapshot, received '${recomputeSnapshot.status}'.`,
    );
  }
  const rawDailyPrices = await loadDailyPrices(tx, recomputeSnapshot.id);
  const latestConfirmedDate = await loadPublicConfirmedLatestDate(tx, {
    datasetKey: env.datasetKey,
    observedBeforeOrAt: recomputeSnapshot.currentTruthCutoffAt,
  });
  const dailyPrices = filterDailyPricesByConfirmedDate(rawDailyPrices, latestConfirmedDate);

  if (dailyPrices.length === 0) {
    throw new Error(
      `Forecast pipeline requires current daily prices for recompute snapshot '${recomputeSnapshot.id}'.`,
    );
  }

  const dailySeriesWeekly = aggregateDailyPrices(dailyPrices, ForecastHorizonKind.weekly);
  const dailySeriesMonthly = aggregateDailyPrices(dailyPrices, ForecastHorizonKind.monthly);
  const fallbackSeries = shouldLoadQ2Fallback(dailyPrices, dailySeriesWeekly, dailySeriesMonthly)
    ? await loadOpinetQ2FallbackSeries({
        year: resolveFallbackYear(dailyPrices, recomputeSnapshot.currentTruthCutoffAt),
        fetchImpl: input.fetchImpl,
      })
    : null;
  const weeklySeries = fallbackSeries
    ? mergeSeries(dailySeriesWeekly, fallbackSeries.weeklySeries)
    : dailySeriesWeekly;
  const monthlySeries = fallbackSeries
    ? mergeSeries(dailySeriesMonthly, fallbackSeries.monthlySeries)
    : dailySeriesMonthly;

  if (weeklySeries.length === 0 || monthlySeries.length === 0) {
    throw new Error("Forecast pipeline requires both weekly and monthly aggregate history.");
  }

  const weeklyBaseline = buildBaselineForecast({
    horizonKind: ForecastHorizonKind.weekly,
    historicalPoints: weeklySeries,
    horizonCount: FORECAST_WEEKLY_HORIZON_COUNT,
  });
  const monthlyBaseline = buildBaselineForecast({
    horizonKind: ForecastHorizonKind.monthly,
    historicalPoints: monthlySeries,
    horizonCount: FORECAST_MONTHLY_HORIZON_COUNT,
  });
  const gate = evaluateMapeGate({
    weeklySeries,
    backtestWeeks: FORECAST_BACKTEST_WEEKS,
    mapeThresholdPct: FORECAST_MAPE_THRESHOLD_PCT,
  });
  const approvalState = gate.approvalState;
  const degradedReason = gate.degradedReason;
  const indicators = await loadIndicatorSnapshots(tx, recomputeSnapshot.currentTruthCutoffAt);
  const approvedWeeklyForecastPoints = applyIndicatorAdjustment(
    weeklyBaseline.projections,
    indicators,
    weeklyBaseline.diagnostics.baselineLevelKrwPerL,
  );
  const approvedMonthlyForecastPoints = applyIndicatorAdjustment(
    monthlyBaseline.projections,
    indicators,
    monthlyBaseline.diagnostics.baselineLevelKrwPerL,
  );
  const weeklyForecastPoints =
    approvalState === ForecastApprovalState.approved
      ? approvedWeeklyForecastPoints
      : stripConfidenceBounds(approvedWeeklyForecastPoints);
  const monthlyForecastPoints =
    approvalState === ForecastApprovalState.approved
      ? approvedMonthlyForecastPoints
      : stripConfidenceBounds(approvedMonthlyForecastPoints);
  const forecastPoints = [...weeklyForecastPoints, ...monthlyForecastPoints];
  const completedAt = new Date();
  const forecastRun = await tx.forecastRun.create({
    data: {
      recomputeSnapshotId: recomputeSnapshot.id,
      status: RunStatus.succeeded,
      approvalState,
      backtestWeeks: gate.backtestWeeks,
      mapePct: gate.mapePct,
      maeKrwPerL: gate.maeKrwPerL,
      startedAt,
      completedAt,
      metadata: toJsonObject({
        datasetKey: env.datasetKey,
        requestedByRuntime: input.requestedByRuntime,
        fallbackMode: fallbackSeries ? "q2-stats-supplemented" : approvalState === ForecastApprovalState.degraded ? "degraded-unavailable" : "normal",
        degradedReason,
        qualityGate: {
          blockingMetric: "mape",
          thresholdPct: gate.thresholdPct,
          evaluatedPointCount: gate.evaluatedPointCount,
          skippedZeroActualCount: gate.skippedZeroActualCount,
          backtestWeeks: gate.backtestWeeks,
          backtestPoints: gate.backtestPoints.map((point) => ({
            targetDate: point.targetDate.toISOString(),
            actualKrwPerL: point.actualKrwPerL,
            forecastKrwPerL: point.forecastKrwPerL,
            absoluteErrorKrwPerL: point.absoluteErrorKrwPerL,
            absolutePercentageErrorPct: point.absolutePercentageErrorPct,
          })),
        },
        baseline: {
          weekly: weeklyBaseline.diagnostics,
          monthly: monthlyBaseline.diagnostics,
        },
        source: {
          currentTruthCutoffAt: recomputeSnapshot.currentTruthCutoffAt?.toISOString() ?? null,
          currentRowCount: dailyPrices.length,
          currentRevisionIds: dailyPrices.map((row) => row.currentRevisionId),
          fallback: fallbackSeries
            ? {
                quarter: `${resolveFallbackYear(dailyPrices, recomputeSnapshot.currentTruthCutoffAt)}-Q2`,
                weeklyPointCount: fallbackSeries.weeklySeries.length,
                monthlyPointCount: fallbackSeries.monthlySeries.length,
              }
            : null,
        },
        indicators: indicators.map((indicator) => ({
          indicatorCode: indicator.indicatorCode,
          observedAt: indicator.observedAt.toISOString(),
          value: indicator.value,
        })),
      }),
      points: {
        create: forecastPoints.map((point) => ({
          horizonKind: point.horizonKind,
          horizonIndex: point.horizonIndex,
          targetDate: point.targetDate,
          pointKrwPerL: point.pointKrwPerL,
          lowerBoundKrwPerL: point.lowerBoundKrwPerL,
          upperBoundKrwPerL: point.upperBoundKrwPerL,
        })),
      },
    },
  });

  return {
    forecastRun: toForecastRunRecord(forecastRun),
    status: "succeeded",
    recomputeSnapshotId: recomputeSnapshot.id,
    datasetKey: recomputeSnapshot.datasetKey,
    approvalState,
    degradedReason,
    weeklySeries,
    monthlySeries,
    weeklyForecastPoints,
    monthlyForecastPoints,
    forecastPoints,
    gate,
    indicators,
  };
}
