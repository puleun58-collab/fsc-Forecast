import { RunStatus, type Prisma } from "@prisma/client";

import { db } from "../db";
import type { RecomputeSnapshotResult } from "./types";
import { OPINET_DATASET_KEY } from "./types";

interface CreateRecomputeSnapshotInput {
  triggeringIngestRunId: string;
  triggerReason: string;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}

function toMetadataObject(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return { ...value };
}

export async function createRecomputeSnapshot(
  input: CreateRecomputeSnapshotInput,
): Promise<RecomputeSnapshotResult> {
  const tx = input.tx ?? db;
  const currentTruthCutoffAt = new Date();
  const currentRows = await tx.dailyPriceCurrent.findMany({
    where: {
      datasetKey: OPINET_DATASET_KEY,
    },
    orderBy: {
      priceDate: "asc",
    },
    select: {
      id: true,
      currentRevisionId: true,
    },
  });

  const snapshot = await tx.recomputeSnapshot.create({
    data: {
      datasetKey: OPINET_DATASET_KEY,
      triggeringIngestRunId: input.triggeringIngestRunId,
      status: RunStatus.succeeded,
      triggerReason: input.triggerReason,
      currentTruthCutoffAt,
      startedAt: currentTruthCutoffAt,
      completedAt: currentTruthCutoffAt,
      metadata: {
        currentRowCount: currentRows.length,
        latestCurrentRevisionIds: currentRows.map((row) => row.currentRevisionId),
        ...toMetadataObject(input.metadata),
      },
    },
  });

  if (currentRows.length > 0) {
    await tx.dailyPriceCurrent.updateMany({
      where: {
        id: {
          in: currentRows.map((row) => row.id),
        },
      },
      data: {
        latestRecomputeSnapshotId: snapshot.id,
      },
    });
  }

  return {
    snapshotId: snapshot.id,
    datasetKey: snapshot.datasetKey,
    triggeringIngestRunId: input.triggeringIngestRunId,
    currentTruthCutoffAt,
    currentRowCount: currentRows.length,
    latestCurrentRevisionIds: currentRows.map((row) => row.currentRevisionId),
  };
}
