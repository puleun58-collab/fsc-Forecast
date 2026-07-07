import type { Prisma, RunStatus } from "@prisma/client";

import { db } from "../db";
import { fetchOpinetAverageDieselPrices } from "../opinet/fetch-avg-price";
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

    const fetchedRows = await fetchOpinetAverageDieselPrices(request.fetchImpl);

    if (fetchedRows.length === 0) {
      throw new Error("Opinet diesel ingest returned no national average rows.");
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
    });

    const completedRun = await recordSucceededIngestRun(queuedRun.id, {
      stage: "completed",
      queue: request.queueMetadata ?? {},
      fetchedRowCount: fetchedRows.length,
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
    });

    return {
      ingestRun: completedRun,
      fetchedRows,
      reconcile,
      snapshot,
    };
  } catch (error) {
    await recordFailedIngestRun(queuedRun.id, error, {
      stage: "failed",
      queue: request.queueMetadata ?? {},
    });
    throw error;
  }
}