import {
  OPINET_WEEKLY_COLLECTION_DAY_COUNT,
  getOpinetWeekEnd,
  getOpinetWeekStart,
  isOpinetWeeklyCollectionDay,
} from "../opinet/weekly-period";

import {
  ForecastApprovalState,
  ForecastHorizonKind,
  ForecastModelTransitionSourceKind,
  ForecastModelTransitionStatus,
  RunStatus,
  type Prisma,
} from "@prisma/client";

import { db } from "../db";
import { externalIndicatorCodes } from "../external-indicators/catalog";
import { env } from "../env";
import { loadPublicConfirmedLatestDate } from "../opinet/resolve-public-confirmed-date";
import { buildBaselineForecast } from "./build-baseline-forecast";
import { serializeBacktestOneStepPoints } from "./backtest-detail";
import { buildForecastErrorAnalysis } from "./forecast-error-analysis";
import {
  buildParameterSensitivity,
  serializeSensitivityParamsKey,
} from "./parameter-sensitivity";
import {
  parseTransitionParams,
  resolvePendingTransition,
} from "./model-transition";
import {
  readPostTransitionMonitoring,
  recordPostTransitionCycle,
  resolvePostTransitionMonitoring,
} from "./post-transition-monitoring";
import {
  readShadowValidation,
  recordShadowCycle,
  resolveShadowSession,
} from "./shadow-validation";
import { runWalkForwardBacktest } from "./run-walk-forward-backtest";
import { buildForecastQualityGate } from "./build-forecast-quality-gate";
import {
  buildWeeklyForecast,
  type ForecastIndicatorWeeklyPoint,
  type ForecastIndicatorWeeklySeries,
} from "./build-weekly-forecast";
import { FORECAST_MODEL_VERSION, FORECAST_RANGE_QUANTILE_LEVEL } from "./forecast-model-config";
import {
  resolveForecastModelState,
  serializeForecastModelParams,
} from "./forecast-model-state";
import { loadOpinetQ2FallbackSeries } from "./load-opinet-q2-fallback";
import { selectForecastModel } from "./select-forecast-model";
import {
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

interface IndicatorHistoryRow {
  indicatorCode: string;
  observedAt: Date;
  value: Prisma.Decimal;
}

async function loadIndicatorHistory(
  tx: Prisma.TransactionClient,
  currentTruthCutoffAt: Date | null,
): Promise<IndicatorHistoryRow[]> {
  return tx.externalIndicatorHistory.findMany({
    where: {
      indicatorCode: {
        in: [...externalIndicatorCodes],
      },
      ...(currentTruthCutoffAt ? { observedAt: { lte: currentTruthCutoffAt } } : {}),
    },
    orderBy: {
      observedAt: "asc",
    },
    select: {
      indicatorCode: true,
      observedAt: true,
      value: true,
    },
  });
}

function buildIndicatorSnapshots(
  rows: readonly IndicatorHistoryRow[],
  currentTruthCutoffAt: Date | null,
): ForecastIndicatorSnapshot[] {
  if (!currentTruthCutoffAt) {
    return [];
  }

  const snapshots: ForecastIndicatorSnapshot[] = [];

  for (const indicatorCode of externalIndicatorCodes) {
    const indicatorRows = rows.filter((row) => row.indicatorCode === indicatorCode);

    if (indicatorRows.length === 0) {
      continue;
    }

    const latest = indicatorRows[indicatorRows.length - 1];
    const previous = indicatorRows[indicatorRows.length - 2] ?? null;
    const previousValue = previous === null ? null : Number(previous.value);
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

function buildIndicatorWeeklySeries(
  rows: readonly IndicatorHistoryRow[],
): ForecastIndicatorWeeklySeries {
  const records = rows.filter(
    (row) => row.indicatorCode === "dubai" || row.indicatorCode === "usd-krw",
  );
  const weeklyBuckets = new Map<
    string,
    { indicatorCode: string; weekEndDate: Date; observedAt: Date; total: number; count: number }
  >();

  for (const record of records) {
    const weekEndDate = getOpinetWeekEnd(toDateOnly(record.observedAt));
    const key = `${record.indicatorCode}:${weekEndDate.toISOString()}`;
    const bucket = weeklyBuckets.get(key);

    if (bucket === undefined) {
      weeklyBuckets.set(key, {
        indicatorCode: record.indicatorCode,
        weekEndDate,
        observedAt: record.observedAt,
        total: Number(record.value),
        count: 1,
      });
      continue;
    }

    bucket.total += Number(record.value);
    bucket.count += 1;
    bucket.observedAt = record.observedAt;
  }

  const orderedBuckets = [...weeklyBuckets.values()].sort(
    (left, right) => left.weekEndDate.getTime() - right.weekEndDate.getTime(),
  );
  const dubai: ForecastIndicatorWeeklyPoint[] = [];
  const usdKrw: ForecastIndicatorWeeklyPoint[] = [];

  for (const bucket of orderedBuckets) {
    const point: ForecastIndicatorWeeklyPoint = {
      weekEndDate: bucket.weekEndDate,
      observedAt: bucket.observedAt,
      value: bucket.total / bucket.count,
    };

    if (bucket.indicatorCode === "dubai") {
      dubai.push(point);
    } else {
      usdKrw.push(point);
    }
  }

  return { dubai, usdKrw };
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

  const monthlyBaseline = buildBaselineForecast({
    horizonKind: ForecastHorizonKind.monthly,
    historicalPoints: monthlySeries,
    horizonCount: FORECAST_MONTHLY_HORIZON_COUNT,
  });
  const indicatorHistory = await loadIndicatorHistory(tx, recomputeSnapshot.currentTruthCutoffAt);
  const indicatorWeeklySeries = buildIndicatorWeeklySeries(indicatorHistory);
  const indicators = buildIndicatorSnapshots(indicatorHistory, recomputeSnapshot.currentTruthCutoffAt);
  const [previousRun, pendingTransition] = await Promise.all([
    tx.forecastRun.findFirst({
      where: {
        status: RunStatus.succeeded,
        recomputeSnapshot: {
          datasetKey: env.datasetKey,
        },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        metadata: true,
      },
    }),
    tx.forecastModelTransition.findFirst({
      where: {
        datasetKey: env.datasetKey,
        status: ForecastModelTransitionStatus.approved_pending,
      },
      orderBy: { approvedAt: "asc" },
    }),
  ]);
  const previousModelState = resolveForecastModelState(previousRun?.metadata ?? null);
  const transitionDecision = resolvePendingTransition(
    pendingTransition === null
      ? null
      : {
          status: pendingTransition.status,
          modelVersion: pendingTransition.modelVersion,
          baselineFingerprint: pendingTransition.baselineFingerprint,
          candidateParams: parseTransitionParams(pendingTransition.candidateParams),
        },
    previousModelState.params,
    FORECAST_MODEL_VERSION,
  );

  if (transitionDecision.action === "cancel" && pendingTransition !== null) {
    await tx.forecastModelTransition.update({
      where: { id: pendingTransition.id },
      data: {
        status: ForecastModelTransitionStatus.cancelled,
        cancelledAt: startedAt,
        cancellationReason: transitionDecision.reason,
      },
    });
  }

  const appliedTransition =
    transitionDecision.action === "apply" && pendingTransition !== null ? pendingTransition : null;
  // 승인된 후보는 이번 실행의 운영 설정으로 들어가고, 적용 시점부터 기존 cooldown 보호를 받는다.
  const effectiveParams =
    transitionDecision.action === "apply" ? transitionDecision.candidateParams : previousModelState.params;
  const effectivePromotedAt =
    appliedTransition === null ? previousModelState.promotedAt : startedAt;
  const selection = selectForecastModel({
    weeklySeries,
    indicatorSeries: indicatorWeeklySeries,
    horizonCount: FORECAST_WEEKLY_HORIZON_COUNT,
    currentParams: effectiveParams,
    currentPromotedAt: effectivePromotedAt,
    now: startedAt,
  });
  const weeklyForecast = buildWeeklyForecast({
    weeklySeries,
    indicatorSeries: indicatorWeeklySeries,
    params: selection.selectedParams,
    horizonCount: FORECAST_WEEKLY_HORIZON_COUNT,
    absoluteErrorByHorizon: selection.selectedBacktest.absoluteErrorByHorizon,
  });
  const gate = buildForecastQualityGate({
    recent: selection.selectedBacktest.recentOneStep,
    oneStepPoints: selection.selectedBacktest.oneStepPoints,
    mapeThresholdPct: FORECAST_MAPE_THRESHOLD_PCT,
    unavailableReason: weeklyForecast.status === "ready" ? null : weeklyForecast.pendingReason,
  });
  const backtestByParamsKey = new Map(
    selection.candidateBacktests.map((candidate) => [
      serializeSensitivityParamsKey(candidate.params),
      candidate,
    ]),
  );
  const parameterSensitivity = buildParameterSensitivity({
    currentParams: selection.selectedParams,
    currentBacktest: selection.selectedBacktest,
    evaluatedAt: startedAt,
    // 이미 평가한 후보는 재사용하고, Trend 후보처럼 없는 조합만 새로 계산한다.
    evaluate: (params) =>
      backtestByParamsKey.get(serializeSensitivityParamsKey(params)) ??
      runWalkForwardBacktest({
        weeklySeries,
        indicatorSeries: indicatorWeeklySeries,
        params,
        horizonCount: FORECAST_WEEKLY_HORIZON_COUNT,
      }),
  });
  const monitoringSession = resolvePostTransitionMonitoring({
    previous: readPostTransitionMonitoring(previousRun?.metadata ?? null),
    appliedTransition:
      appliedTransition === null
        ? null
        : {
            transitionId: appliedTransition.id,
            currentParams: parseTransitionParams(appliedTransition.candidateParams),
            rollbackParams: parseTransitionParams(appliedTransition.baselineParams),
            sourceKind: appliedTransition.sourceKind,
          },
    currentParams: selection.selectedParams,
    modelVersion: FORECAST_MODEL_VERSION,
    now: startedAt,
  });
  // 전환 적용 run과 롤백 검토 상태에서는 새 Shadow 후보를 시작하지 않는다.
  const shadowCandidatesAllowed =
    appliedTransition === null &&
    (monitoringSession === null || monitoringSession.status !== "rollback_reviewable");
  const shadowSession = resolveShadowSession({
    previousSession: readShadowValidation(previousRun?.metadata ?? null),
    modelVersion: FORECAST_MODEL_VERSION,
    baselineParams: selection.selectedParams,
    candidates: shadowCandidatesAllowed
      ? parameterSensitivity.tuningCandidates.map((candidate) => ({
          params: candidate.params,
          meetsPromotionQuality: candidate.meetsPromotionQuality,
          source:
            candidate.kind === "combination"
              ? `parameter-combination:${candidate.factorKeys.join("+")}`
              : `parameter-sensitivity:${candidate.groupKey}`,
        }))
      : [],
    now: startedAt,
  });
  // Shadow는 운영 예측과 완전히 같은 입력으로 1주 ahead 예측만 추가로 만든다.
  const shadowForecast =
    shadowSession === null || shadowSession.status !== "validating"
      ? null
      : buildWeeklyForecast({
          weeklySeries,
          indicatorSeries: indicatorWeeklySeries,
          params: shadowSession.candidateParams,
          horizonCount: 1,
        });
  const shadowValidation =
    shadowSession === null
      ? null
      : shadowSession.status !== "validating"
        ? shadowSession
        : recordShadowCycle({
            session: shadowSession,
            confirmedWeeks: weeklySeries.map((point) => ({
              targetDate: point.targetDate,
              actualKrwPerL: point.pointKrwPerL,
            })),
            now: startedAt,
            prediction:
              weeklyForecast.status !== "ready" ||
              weeklyForecast.anchorWeekEndDate === null ||
              weeklyForecast.anchorPriceKrwPerL === null ||
              weeklyForecast.points[0] === undefined ||
              shadowForecast === null ||
              shadowForecast.status !== "ready" ||
              shadowForecast.points[0] === undefined
                ? null
                : {
                    originWeekEndDate: weeklyForecast.anchorWeekEndDate,
                    targetDate: weeklyForecast.points[0].targetDate,
                    anchorKrwPerL: weeklyForecast.anchorPriceKrwPerL,
                    baselineForecastKrwPerL: weeklyForecast.points[0].pointKrwPerL,
                    shadowForecastKrwPerL: shadowForecast.points[0].pointKrwPerL,
                    issuedAt: startedAt,
                  },
          });
  // 롤백 기준 설정도 운영 예측과 동일한 입력으로 1주 ahead 예측만 추가 계산한다.
  const rollbackForecast =
    monitoringSession === null || monitoringSession.status === "stopped" || monitoringSession.status === "rolled_back"
      ? null
      : buildWeeklyForecast({
          weeklySeries,
          indicatorSeries: indicatorWeeklySeries,
          params: monitoringSession.rollbackParams,
          horizonCount: 1,
        });
  const postTransitionMonitoring =
    monitoringSession === null
      ? null
      : recordPostTransitionCycle({
          monitoring: monitoringSession,
          confirmedWeeks: weeklySeries.map((point) => ({
            targetDate: point.targetDate,
            actualKrwPerL: point.pointKrwPerL,
          })),
          now: startedAt,
          prediction:
            weeklyForecast.status !== "ready" ||
            weeklyForecast.anchorWeekEndDate === null ||
            weeklyForecast.anchorPriceKrwPerL === null ||
            weeklyForecast.points[0] === undefined ||
            rollbackForecast === null ||
            rollbackForecast.status !== "ready" ||
            rollbackForecast.points[0] === undefined
              ? null
              : {
                  originWeekEndDate: weeklyForecast.anchorWeekEndDate,
                  targetDate: weeklyForecast.points[0].targetDate,
                  anchorKrwPerL: weeklyForecast.anchorPriceKrwPerL,
                  currentForecastKrwPerL: weeklyForecast.points[0].pointKrwPerL,
                  rollbackForecastKrwPerL: rollbackForecast.points[0].pointKrwPerL,
                  issuedAt: startedAt,
                },
        });
  const approvalState = gate.approvalState;
  const degradedReason = gate.degradedReason;
  const weeklyForecastPoints =
    approvalState === ForecastApprovalState.approved
      ? weeklyForecast.points
      : stripConfidenceBounds(weeklyForecast.points);
  const monthlyForecastPoints = stripConfidenceBounds(monthlyBaseline.projections);
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
        model: {
          version: FORECAST_MODEL_VERSION,
          promotedAt:
            appliedTransition !== null
              ? completedAt.toISOString()
              : selection.promoted
                ? startedAt.toISOString()
                : previousModelState.promotedAt?.toISOString() ?? null,
          params: serializeForecastModelParams(selection.selectedParams),
          promoted: selection.promoted || appliedTransition !== null,
          promotionReason:
            appliedTransition === null
              ? selection.promotionReason
              : appliedTransition.sourceKind === ForecastModelTransitionSourceKind.post_transition_rollback
                ? "post_transition_rollback_applied"
                : "admin_approved_shadow_transition",
          changeSource:
            appliedTransition === null ? "automatic_selection" : appliedTransition.sourceKind,
          transition:
            appliedTransition === null
              ? null
              : {
                  transitionId: appliedTransition.id,
                  sourceKind: appliedTransition.sourceKind,
                  shadowSessionId: appliedTransition.shadowSessionId,
                  candidateFingerprint: appliedTransition.candidateFingerprint,
                  previousParams: serializeForecastModelParams(previousModelState.params),
                  candidateParams: serializeForecastModelParams(effectiveParams),
                  appliedAt: completedAt.toISOString(),
                },
          previousVersion: previousModelState.modelVersion,
          previousParams: serializeForecastModelParams(previousModelState.params),
          maeImprovementRatio: selection.maeImprovementRatio,
          mapeImprovementPctPoint: selection.mapeImprovementPctPoint,
          evaluatedCandidateCount: selection.evaluatedCandidateCount,
          bestByModelId: selection.bestByModelId,
          recent: selection.selectedBacktest.recent,
          long: selection.selectedBacktest.long,
          currentModelRecent: selection.currentBacktest.recent,
          currentModelLong: selection.currentBacktest.long,
          horizonErrors: selection.selectedBacktest.horizons,
          rangeQuantileLevel: FORECAST_RANGE_QUANTILE_LEVEL,
          recentOneStep: selection.selectedBacktest.recentOneStep,
          longOneStep: selection.selectedBacktest.longOneStep,
          currentModelRecentOneStep: selection.currentBacktest.recentOneStep,
          backtestOneStepPoints: serializeBacktestOneStepPoints(selection.selectedBacktest.oneStepPoints),
          errorAnalysis: buildForecastErrorAnalysis({
            selectedModelId: selection.selectedParams.modelId,
            selectedParams: selection.selectedParams,
            selectedBacktest: selection.selectedBacktest,
            candidateBacktestsByModelId: selection.bestBacktestByModelId,
          }),
          parameterSensitivity,
          shadowValidation,
          postTransitionMonitoring,
        },
        weeklyForecast: {
          status: weeklyForecast.status,
          pendingReason: weeklyForecast.pendingReason,
          anchorWeekEndDate: weeklyForecast.anchorWeekEndDate?.toISOString() ?? null,
          anchorPriceKrwPerL: weeklyForecast.anchorPriceKrwPerL,
          trendDeltaKrwPerL: weeklyForecast.trendDeltaKrwPerL,
          trendLookbackCount: weeklyForecast.trendLookbackCount,
          externalAdjustmentRatio: weeklyForecast.externalAdjustmentRatio,
          externalAdjustmentCapRatio: selection.selectedParams.externalAdjustmentCapRatio,
          externalAdjustmentCapReached: weeklyForecast.externalAdjustmentCapReached,
          dubai:
            weeklyForecast.dubai === null
              ? null
              : {
                  ...weeklyForecast.dubai,
                  basisWeekEndDate: weeklyForecast.dubai.basisWeekEndDate?.toISOString() ?? null,
                  previousWeekEndDate: weeklyForecast.dubai.previousWeekEndDate?.toISOString() ?? null,
                },
          usdKrw:
            weeklyForecast.usdKrw === null
              ? null
              : {
                  ...weeklyForecast.usdKrw,
                  basisWeekEndDate: weeklyForecast.usdKrw.basisWeekEndDate?.toISOString() ?? null,
                  previousWeekEndDate: weeklyForecast.usdKrw.previousWeekEndDate?.toISOString() ?? null,
                },
        },
        baseline: {
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

  // ForecastRun 생성이 성공한 뒤 같은 transaction에서만 적용 완료로 바꾼다.
  if (appliedTransition !== null) {
    await tx.forecastModelTransition.update({
      where: { id: appliedTransition.id },
      data: {
        status: ForecastModelTransitionStatus.applied,
        appliedAt: completedAt,
        appliedForecastRunId: forecastRun.id,
      },
    });
  }

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
