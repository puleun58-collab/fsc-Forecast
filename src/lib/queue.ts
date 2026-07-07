import { createHash } from "node:crypto";

import { db } from "./db";
import { env } from "./env";

export type RuntimeJobKind = "ingest" | "recompute" | "export";
export type RuntimeJobTrigger = "scheduled" | "retry" | "manual";

export interface IngestJobDescriptor {
  kind: "ingest";
  datasetKey: string;
  runId: string;
  trigger: RuntimeJobTrigger;
  requestedByRuntime: string;
}

export interface RecomputeJobDescriptor {
  kind: "recompute";
  datasetKey: string;
  snapshotId: string;
  requestedByRuntime: string;
  triggeringIngestRunId?: string;
}

export interface ExportJobDescriptor {
  kind: "export";
  datasetKey: string;
  exportRunId: string;
  recomputeSnapshotId: string;
  requestedByRuntime: string;
}

export type RuntimeJobDescriptor =
  | IngestJobDescriptor
  | RecomputeJobDescriptor
  | ExportJobDescriptor;

export interface QueueLaneDescriptor {
  key: string;
  mode: "serialized" | "after-successful-snapshot";
  allowedKinds: RuntimeJobKind[];
}

export interface EnqueueReceipt {
  lane: QueueLaneDescriptor;
  job: RuntimeJobDescriptor;
}

export interface AdvisoryLockDescriptor {
  classId: number;
  objectId: number;
  key: string;
}

export interface SerializedJobExecutionContext {
  receipt: EnqueueReceipt;
  lock: AdvisoryLockDescriptor;
  startedAt: string;
}

export interface SerializedJobExecutionReceipt<Result> {
  receipt: EnqueueReceipt;
  lock: AdvisoryLockDescriptor;
  startedAt: string;
  completedAt: string;
  result: Result;
}

export class QueueNotConfiguredError extends Error {
  constructor(message = "Runtime queue adapter is not configured for this deployment.") {
    super(message);
    this.name = "QueueNotConfiguredError";
  }
}

const serializedDatasetLane: QueueLaneDescriptor = {
  key: `${env.queueDomain}:${env.datasetKey}:serialized-runtime`,
  mode: "serialized",
  allowedKinds: ["ingest", "recompute"],
};

const exportSnapshotLanePrefix = `${env.queueDomain}:${env.datasetKey}:export-snapshot`;

export function getQueueLane(job: RuntimeJobDescriptor): QueueLaneDescriptor {
  if (job.kind === "export") {
    return {
      key: `${exportSnapshotLanePrefix}:${job.recomputeSnapshotId}`,
      mode: "after-successful-snapshot",
      allowedKinds: ["export"],
    };
  }

  return serializedDatasetLane;
}

export function createEnqueueReceipt(job: RuntimeJobDescriptor): EnqueueReceipt {
  return {
    lane: getQueueLane(job),
    job,
  };
}

export function assertDatasetScopedJob(job: RuntimeJobDescriptor): void {
  if (job.datasetKey !== env.datasetKey) {
    throw new Error(
      `Runtime skeleton is locked to dataset '${env.datasetKey}', received '${job.datasetKey}'.`,
    );
  }
}

function createAdvisoryLockDescriptor(lane: QueueLaneDescriptor): AdvisoryLockDescriptor {
  const digest = createHash("sha256").update(lane.key).digest();

  return {
    classId: digest.readInt32BE(0),
    objectId: digest.readInt32BE(4),
    key: lane.key,
  };
}

export interface RuntimeQueueAdapter {
  enqueue(job: RuntimeJobDescriptor): Promise<EnqueueReceipt>;
  runSerialized<Result>(
    job: RuntimeJobDescriptor,
    handler: (context: SerializedJobExecutionContext) => Promise<Result>,
  ): Promise<SerializedJobExecutionReceipt<Result>>;
}

export class DatabaseRuntimeQueueAdapter implements RuntimeQueueAdapter {
  async enqueue(job: RuntimeJobDescriptor): Promise<EnqueueReceipt> {
    assertDatasetScopedJob(job);

    return createEnqueueReceipt(job);
  }

  async runSerialized<Result>(
    job: RuntimeJobDescriptor,
    handler: (context: SerializedJobExecutionContext) => Promise<Result>,
  ): Promise<SerializedJobExecutionReceipt<Result>> {
    const receipt = await this.enqueue(job);

    if (receipt.lane.mode !== "serialized") {
      throw new QueueNotConfiguredError(
        `Runtime queue only executes serialized ingest/recompute jobs in this MVP, received lane mode '${receipt.lane.mode}'.`,
      );
    }

    const lock = createAdvisoryLockDescriptor(receipt.lane);

    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${lock.classId} AS integer), CAST(${lock.objectId} AS integer))`;

        const startedAt = new Date().toISOString();
        const result = await handler({
          receipt,
          lock,
          startedAt,
        });

        return {
          receipt,
          lock,
          startedAt,
          completedAt: new Date().toISOString(),
          result,
        };
      },
      {
        maxWait: 60_000,
        timeout: 600_000,
      },
    );
  }
}

export const runtimeQueue = new DatabaseRuntimeQueueAdapter();

export const runtimeQueueContract = Object.freeze({
  datasetKey: env.datasetKey,
  serializedDatasetLane,
  exportSnapshotLanePrefix,
});