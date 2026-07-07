import { Prisma, RunStatus } from "@prisma/client";

import { db } from "../db";
import type { IngestRunLifecycleRecord, OpinetIngestRequest } from "./types";
import { OPINET_DATASET_KEY } from "./types";

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

function toInputJsonObject(value: unknown): Prisma.InputJsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Prisma.InputJsonObject;
}

async function updateIngestRun(
  runId: string,
  data: {
    status?: RunStatus;
    startedAt?: Date;
    completedAt?: Date;
    errorSummary?: string | null;
    metadataPatch?: Prisma.InputJsonObject;
  },
): Promise<IngestRunLifecycleRecord> {
  const existing = await db.ingestRun.findUniqueOrThrow({
    where: { id: runId },
    select: {
      metadata: true,
    },
  });

  const metadata: Prisma.InputJsonObject = {
    ...toInputJsonObject(existing.metadata),
    ...toInputJsonObject(data.metadataPatch),
  };

  const updated = await db.ingestRun.update({
    where: { id: runId },
    data: {
      status: data.status,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      errorSummary: data.errorSummary,
      metadata,
    },
  });

  return toLifecycleRecord(updated);
}

export async function recordQueuedIngestRun(
  request: OpinetIngestRequest,
): Promise<IngestRunLifecycleRecord> {
  const created = await db.ingestRun.create({
    data: {
      datasetKey: OPINET_DATASET_KEY,
      triggerKind: request.triggerKind,
      requestedByRuntime: request.requestedByRuntime,
      status: RunStatus.queued,
      sourceWindowStart: request.sourceWindowStart,
      sourceWindowEnd: request.sourceWindowEnd,
      metadata: {
        requestedByRuntime: request.requestedByRuntime,
        triggerKind: request.triggerKind,
        sourceWindowStart: request.sourceWindowStart?.toISOString() ?? null,
        sourceWindowEnd: request.sourceWindowEnd?.toISOString() ?? null,
        requestMetadata: request.metadata ?? null,
      },
    },
  });

  return toLifecycleRecord(created);
}

export async function recordStartedIngestRun(
  runId: string,
  metadataPatch: Prisma.InputJsonObject = {},
): Promise<IngestRunLifecycleRecord> {
  return updateIngestRun(runId, {
    status: RunStatus.running,
    startedAt: new Date(),
    errorSummary: null,
    metadataPatch,
  });
}

export async function recordSucceededIngestRun(
  runId: string,
  metadataPatch: Prisma.InputJsonObject = {},
): Promise<IngestRunLifecycleRecord> {
  return updateIngestRun(runId, {
    status: RunStatus.succeeded,
    completedAt: new Date(),
    errorSummary: null,
    metadataPatch,
  });
}

export async function recordFailedIngestRun(
  runId: string,
  error: unknown,
  metadataPatch: Prisma.InputJsonObject = {},
): Promise<IngestRunLifecycleRecord> {
  const errorSummary = error instanceof Error ? error.message : String(error);

  return updateIngestRun(runId, {
    status: RunStatus.failed,
    completedAt: new Date(),
    errorSummary,
    metadataPatch: {
      ...metadataPatch,
      failureMessage: errorSummary,
    },
  });
}
