import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { env } from "../lib/env";
import { runOpinetIngest } from "../lib/ingest/run-opinet-ingest";
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
      return runOpinetIngest({
        triggerKind: "scheduled",
        requestedByRuntime: env.workerRuntimeId,
        queuedRunId: queuedRun.id,
        queueMetadata: {
          laneKey: receipt.lane.key,
          laneMode: receipt.lane.mode,
          scheduledJobName: env.scheduledJobName,
        },
      });
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
    ingestRun: {
      id: execution.result.ingestRun.id,
      status: execution.result.ingestRun.status,
      startedAt: execution.result.ingestRun.startedAt?.toISOString() ?? null,
      completedAt: execution.result.ingestRun.completedAt?.toISOString() ?? null,
    },
    reconcile: {
      processedRowCount: execution.result.reconcile.processedRowCount,
      createdRevisionCount: execution.result.reconcile.createdRevisionCount,
      supersededRevisionCount: execution.result.reconcile.supersededRevisionCount,
      unchangedRowCount: execution.result.reconcile.unchangedRowCount,
      currentRowCount: execution.result.reconcile.currentRowCount,
    },
    snapshot: {
      snapshotId: execution.result.snapshot.snapshotId,
      currentRowCount: execution.result.snapshot.currentRowCount,
      currentTruthCutoffAt: execution.result.snapshot.currentTruthCutoffAt.toISOString(),
    },
    fetchedRowCount: execution.result.fetchedRows.length,
    forecast: execution.result.forecast,
    cacheRefresh: execution.result.cacheRefresh,
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