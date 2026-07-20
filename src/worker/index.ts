import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { env } from "../lib/env";
import { externalIndicatorCodes } from "../lib/external-indicators/catalog";
import { loadLatestIndicatorStates } from "../lib/external-indicators/latest-indicator-states";

import { runOpinetIngest } from "../lib/ingest/run-opinet-ingest";
import { syncExternalIndicators } from "../lib/external-indicators/sync-external-indicators";
import { recordQueuedIngestRun } from "../lib/ingest/record-ingest-run";
import { runtimeQueue, runtimeQueueContract } from "../lib/queue";

export interface WorkerRunSummary {
  runtimeRole: string;
  workerRuntimeId: string;
  scheduledJobName: string;
  datasetKey: string;
  serializedLaneKey: string;
  exportSnapshotLanePrefix: string;
  startedAt: string;
  completedAt: string;
  status: "succeeded";
  indicatorSync: {
    status: "succeeded" | "failed";
    errorSummary: string | null;
    providerKey: string | null;
    acceptedPointCount: number;
    persistedCount: number;
    createdCount: number;
    updatedCount: number;
    latestStates: Array<{
      indicatorCode: string;
      latestObservationDate: string;
      collectedAt: string;
      value: number;
    }>;
    indicatorStatuses: Array<{
      indicatorCode: string;
      providerKey: string;
      status: "succeeded" | "failed";
      errorSummary: string | null;
      latestObservedAt: string | null;
    }>;
  };
  queue: {
    jobKind: "ingest";
    runId: string;
    trigger: "scheduled";
    requestedByRuntime: string;
    laneKey: string;
    laneMode: "serialized";
    advisoryLockKey: string;
    advisoryLockClassId: number;
    advisoryLockObjectId: number;
    lockStartedAt: string;
    lockCompletedAt: string;
  };
  ingestRun: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  reconcile: {
    processedRowCount: number;
    createdRevisionCount: number;
    supersededRevisionCount: number;
    unchangedRowCount: number;
    currentRowCount: number;
  };
  snapshot: {
    snapshotId: string;
    currentRowCount: number;
    currentTruthCutoffAt: string;
  };
  cacheRefresh: {
    status: 'succeeded' | 'failed';
    errorSummary: string | null;
    daily: {
      fetchedCount: number;
      savedCount: number;
    };
    weekly: {
      fetchedCount: number;
      savedCount: number;
    };
    monthly: {
      fetchedCount: number;
      savedCount: number;
    };
  };

  forecast: {
    forecastRunId: string;
    approvalState: string;
    degradedReason: string | null;
    weeklySeriesCount: number;
    monthlySeriesCount: number;
    weeklyForecastPointCount: number;
    monthlyForecastPointCount: number;
  };

  fetchedRowCount: number;
}

export async function runScheduledWorkerOnce(): Promise<WorkerRunSummary> {
  const startedAt = new Date().toISOString();

  if (env.runtimeRole !== "worker") {
    throw new Error("Worker entrypoint requires RUNTIME_ROLE=worker.");
  }

  const queuedRun = await recordQueuedIngestRun({
    triggerKind: "scheduled",
    requestedByRuntime: env.workerRuntimeId,
    metadata: {
      scheduledJobName: env.scheduledJobName,
      workerRuntimeId: env.workerRuntimeId,
      datasetKey: env.datasetKey,
    },
  });

  const execution = await runtimeQueue.runSerialized(
    {
      kind: "ingest",
      datasetKey: env.datasetKey,
      runId: queuedRun.id,
      trigger: "scheduled",
      requestedByRuntime: env.workerRuntimeId,
    },
    async ({ receipt }) => {
      const indicatorSync = await (async () => {
        try {
          const result = await syncExternalIndicators();
          const failedStatuses = result.indicatorStatuses.filter((status) => status.status === "failed");
          return {
            status: failedStatuses.length === 0 ? "succeeded" as const : "failed" as const,
            errorSummary:
              failedStatuses.length === 0
                ? null
                : failedStatuses.map((status) => `${status.indicatorCode}: ${status.errorSummary}`).join("; "),
            providerKey: result.providerKey,
            acceptedPointCount: result.acceptedPointCount,
            persistedCount: result.persistedCount,
            createdCount: result.createdCount,
            updatedCount: result.updatedCount,
            latestStates: result.latestStates.map((state) => ({
              indicatorCode: state.indicatorCode,
              latestObservationDate: state.observedAt.toISOString(),
              collectedAt: state.collectedAt.toISOString(),
              value: state.value,
            })),
            indicatorStatuses: result.indicatorStatuses.map((status) => ({
              indicatorCode: status.indicatorCode,
              providerKey: status.providerKey,
              status: status.status,
              errorSummary: status.errorSummary,
              latestObservedAt: status.latestObservedAt?.toISOString() ?? null,
            })),
          };
        } catch (error) {
          const latestStates = await loadLatestIndicatorStates({ indicatorCodes: externalIndicatorCodes });
          return {
            status: "failed" as const,
            errorSummary: error instanceof Error ? error.message : String(error),
            providerKey: null,
            acceptedPointCount: 0,
            persistedCount: 0,
            createdCount: 0,
            updatedCount: 0,
            latestStates: latestStates.map((state) => ({
              indicatorCode: state.indicatorCode,
              latestObservationDate: state.observedAt.toISOString(),
              collectedAt: state.collectedAt.toISOString(),
              value: state.value,
            })),
            indicatorStatuses: [],
          };
        }
      })();

      const ingest = await runOpinetIngest({
        triggerKind: "scheduled",
        requestedByRuntime: env.workerRuntimeId,
        queuedRunId: queuedRun.id,
        queueMetadata: {
          laneKey: receipt.lane.key,
          laneMode: receipt.lane.mode,
          scheduledJobName: env.scheduledJobName,
        },
      });

      return {
        indicatorSync,
        ingest,
      };
    },
  );

  return {
    runtimeRole: env.runtimeRole,
    workerRuntimeId: env.workerRuntimeId,
    scheduledJobName: env.scheduledJobName,
    datasetKey: env.datasetKey,
    serializedLaneKey: runtimeQueueContract.serializedDatasetLane.key,
    exportSnapshotLanePrefix: runtimeQueueContract.exportSnapshotLanePrefix,
    startedAt,
    completedAt: execution.completedAt,
    status: "succeeded",
    queue: {
      jobKind: "ingest",
      runId: queuedRun.id,
      trigger: "scheduled",
      requestedByRuntime: env.workerRuntimeId,
      laneKey: execution.receipt.lane.key,
      laneMode: "serialized",
      advisoryLockKey: execution.lock.key,
      advisoryLockClassId: execution.lock.classId,
      advisoryLockObjectId: execution.lock.objectId,
      lockStartedAt: execution.startedAt,
      lockCompletedAt: execution.completedAt,
    },
    indicatorSync: execution.result.indicatorSync,
    ingestRun: {
      id: execution.result.ingest.ingestRun.id,
      status: execution.result.ingest.ingestRun.status,
      startedAt: execution.result.ingest.ingestRun.startedAt?.toISOString() ?? null,
      completedAt: execution.result.ingest.ingestRun.completedAt?.toISOString() ?? null,
    },
    reconcile: {
      processedRowCount: execution.result.ingest.reconcile.processedRowCount,
      createdRevisionCount: execution.result.ingest.reconcile.createdRevisionCount,
      supersededRevisionCount: execution.result.ingest.reconcile.supersededRevisionCount,
      unchangedRowCount: execution.result.ingest.reconcile.unchangedRowCount,
      currentRowCount: execution.result.ingest.reconcile.currentRowCount,
    },
    snapshot: {
      snapshotId: execution.result.ingest.snapshot.snapshotId,
      currentRowCount: execution.result.ingest.snapshot.currentRowCount,
      currentTruthCutoffAt: execution.result.ingest.snapshot.currentTruthCutoffAt.toISOString(),
    },
    fetchedRowCount: execution.result.ingest.fetchedRows.length,
    forecast: execution.result.ingest.forecast,
    cacheRefresh: execution.result.ingest.cacheRefresh,
  };
}

async function main(): Promise<void> {
  try {
    const summary = await runScheduledWorkerOnce();
    console.info(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error("Scheduled worker failed while running the serialized Opinet ingest job.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}