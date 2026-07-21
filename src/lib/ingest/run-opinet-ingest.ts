import type { Prisma, RunStatus } from "@prisma/client";

import { db } from "../db";
import { runForecastPipeline } from "../forecast/run-forecast-pipeline";
import { refreshOpinetSeriesCache } from "../opinet/refresh-series-cache";

import { fetchOpinetDieselDailyHistory } from "../opinet/fetch-daily-history";
import { createRecomputeSnapshot } from "./create-recompute-snapshot";
import {
  recordFailedIngestRun,
  recordQueuedIngestRun,
  recordStartedIngestRun,
  recordSucceededIngestRun,
} from "./record-ingest-run";
import { reconcileDailyPrices } from "./reconcile-daily-prices";
import type { IngestRunLifecycleRecord, OpinetIngestRequest, OpinetIngestResult } from "./types";
import { OPINET_RECOMPUTE_TRIGGER_REASON } from "./types";

interface QueuedOpinetIngestRequest extends OpinetIngestRequest {
  queuedRunId?: string;
  queueMetadata?: Prisma.InputJsonObject;
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}


function toLifecycleRecord(run: {
  id: string;
  datasetKey: string;
  triggerKind: string;
  requestedByRuntime: string;
  status: RunStatus;
  sourceWindowStart: Date | null;
  sourceWindowEnd: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorSummary: string | null;
}): IngestRunLifecycleRecord {
  return {
    id: run.id,
    datasetKey: run.datasetKey,
    triggerKind: run.triggerKind,
    requestedByRuntime: run.requestedByRuntime,
    status: run.status,
    sourceWindowStart: run.sourceWindowStart,
    sourceWindowEnd: run.sourceWindowEnd,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    errorSummary: run.errorSummary,
  };
}

async function resolveQueuedRun(request: QueuedOpinetIngestRequest): Promise<IngestRunLifecycleRecord> {
  if (!request.queuedRunId) {
    return recordQueuedIngestRun(request);
  }

  const existingRun = await db.ingestRun.findUniqueOrThrow({
    where: {
      id: request.queuedRunId,
    },
  });

  return toLifecycleRecord(existingRun);
}

export async function runOpinetIngest(
  request: QueuedOpinetIngestRequest,
): Promise<OpinetIngestResult> {
  const queuedRun = await resolveQueuedRun(request);

  try {
    await recordStartedIngestRun(queuedRun.id, {
      stage: "fetching-opinet-average-price",
      queue: request.queueMetadata ?? {},
    });

    const fetchedRows = await fetchOpinetDieselDailyHistory(request.fetchImpl);

    if (fetchedRows.length === 0) {
      throw new Error("Opinet diesel ingest returned no national average rows.");
    }

    await recordStartedIngestRun(queuedRun.id, {
      stage: "refreshing-opinet-cache-files",
      queue: request.queueMetadata ?? {},
    });

    let cacheRefresh: OpinetIngestResult['cacheRefresh'];

    try {
      const summary = await refreshOpinetSeriesCache({
        fetchImpl: request.fetchImpl,
        dailyEntries: fetchedRows,
      });
      cacheRefresh = {
        status: 'succeeded',
        errorSummary: null,
        ...summary,
      };
    } catch (error) {
      cacheRefresh = {
        status: 'failed',
        errorSummary: error instanceof Error ? error.message : String(error),
        daily: {
          fetchedCount: fetchedRows.length,
          savedCount: 0,
        },
        weekly: {
          fetchedCount: 0,
          savedCount: 0,
        },
        monthly: {
          fetchedCount: 0,
          savedCount: 0,
        },
        quarterly: {
          fetchedCount: 0,
          savedCount: 0,
        },
      };
    }

    const { reconcile, snapshot } = await db.$transaction(async (tx) => {
      const reconcileResult = await reconcileDailyPrices({
        ingestRunId: queuedRun.id,
        rows: fetchedRows,
        tx,
      });
      const snapshotResult = await createRecomputeSnapshot({
        triggeringIngestRunId: queuedRun.id,
        triggerReason: OPINET_RECOMPUTE_TRIGGER_REASON,
        metadata: {
          processedRowCount: reconcileResult.processedRowCount,
          createdRevisionCount: reconcileResult.createdRevisionCount,
          supersededRevisionCount: reconcileResult.supersededRevisionCount,
          unchangedRowCount: reconcileResult.unchangedRowCount,
        },
        tx,
      });

      return {
        reconcile: reconcileResult,
        snapshot: snapshotResult,
      };
    }, {
      maxWait: 10_000,
      timeout: 30_000,
    });

    const forecast = await runForecastPipeline({
      recomputeSnapshotId: snapshot.snapshotId,
      requestedByRuntime: request.requestedByRuntime,
      fetchImpl: request.fetchImpl,
    });

    const completedRun = await recordSucceededIngestRun(queuedRun.id, {
      stage: "completed",
      queue: request.queueMetadata ?? {},
      fetchedRowCount: fetchedRows.length,
      cacheRefresh: toJsonObject({
        status: cacheRefresh.status,
        errorSummary: cacheRefresh.errorSummary,
        daily: cacheRefresh.daily,
        weekly: cacheRefresh.weekly,
        monthly: cacheRefresh.monthly,
        quarterly: cacheRefresh.quarterly,
      }),
      reconcile: {
        processedRowCount: reconcile.processedRowCount,
        createdRevisionCount: reconcile.createdRevisionCount,
        supersededRevisionCount: reconcile.supersededRevisionCount,
        unchangedRowCount: reconcile.unchangedRowCount,
        currentRowCount: reconcile.currentRowCount,
      },
      recomputeSnapshot: {
        snapshotId: snapshot.snapshotId,
        currentRowCount: snapshot.currentRowCount,
        currentTruthCutoffAt: snapshot.currentTruthCutoffAt.toISOString(),
      },
      forecast: {
        forecastRunId: forecast.forecastRun.id,
        approvalState: forecast.approvalState,
        degradedReason: forecast.degradedReason,
        weeklySeriesCount: forecast.weeklySeries.length,
        monthlySeriesCount: forecast.monthlySeries.length,
        weeklyForecastPointCount: forecast.weeklyForecastPoints.length,
        monthlyForecastPointCount: forecast.monthlyForecastPoints.length,
      },
    });


    return {
      ingestRun: completedRun,
      fetchedRows,
      reconcile,
      snapshot,
      forecast: {
        forecastRunId: forecast.forecastRun.id,
        approvalState: forecast.approvalState,
        degradedReason: forecast.degradedReason,
        weeklySeriesCount: forecast.weeklySeries.length,
        monthlySeriesCount: forecast.monthlySeries.length,
        weeklyForecastPointCount: forecast.weeklyForecastPoints.length,
        monthlyForecastPointCount: forecast.monthlyForecastPoints.length,
      },
      cacheRefresh,
    };
  } catch (error) {
    await recordFailedIngestRun(queuedRun.id, error, {
      stage: "failed",
      queue: request.queueMetadata ?? {},
    });
    throw error;
  }
}
