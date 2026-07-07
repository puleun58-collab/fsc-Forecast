import { Prisma } from "@prisma/client";

import { db } from "../db";
import { getExternalIndicatorDefinition } from "./catalog";
import type {
  ExternalIndicatorHistoryRecord,
  ExternalIndicatorPoint,
  PersistIndicatorHistoryResult,
} from "./types";

interface PersistIndicatorHistoryInput {
  points: readonly ExternalIndicatorPoint[];
  tx?: Prisma.TransactionClient;
}

function comparePoints(left: ExternalIndicatorPoint, right: ExternalIndicatorPoint): number {
  const indicatorComparison = left.indicatorCode.localeCompare(right.indicatorCode);

  if (indicatorComparison !== 0) {
    return indicatorComparison;
  }

  return left.observedAt.getTime() - right.observedAt.getTime();
}

function toRecord(row: {
  id: string;
  indicatorCode: string;
  observedAt: Date;
  value: Prisma.Decimal;
  sourcePayload: Prisma.JsonValue | null;
  createdAt: Date;
}): ExternalIndicatorHistoryRecord {
  return {
    id: row.id,
    indicatorCode: row.indicatorCode as ExternalIndicatorHistoryRecord["indicatorCode"],
    observedAt: row.observedAt,
    value: Number(row.value),
    sourcePayload: row.sourcePayload,
    createdAt: row.createdAt,
  };
}

export async function persistIndicatorHistory(
  input: PersistIndicatorHistoryInput,
): Promise<PersistIndicatorHistoryResult> {
  const tx = input.tx ?? db;
  const points = [...input.points].sort(comparePoints);
  const records: ExternalIndicatorHistoryRecord[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const point of points) {
    getExternalIndicatorDefinition(point.indicatorCode);

    if (Number.isNaN(point.observedAt.getTime())) {
      throw new Error(`Indicator observedAt must be a valid Date for '${point.indicatorCode}'.`);
    }

    if (!Number.isFinite(point.value)) {
      throw new Error(`Indicator value must be finite for '${point.indicatorCode}'.`);
    }

    const existing = await tx.externalIndicatorHistory.findUnique({
      where: {
        indicatorCode_observedAt: {
          indicatorCode: point.indicatorCode,
          observedAt: point.observedAt,
        },
      },
      select: {
        id: true,
      },
    });

    const persisted = await tx.externalIndicatorHistory.upsert({
      where: {
        indicatorCode_observedAt: {
          indicatorCode: point.indicatorCode,
          observedAt: point.observedAt,
        },
      },
      create: {
        indicatorCode: point.indicatorCode,
        observedAt: point.observedAt,
        value: new Prisma.Decimal(point.value),
        sourcePayload: point.sourcePayload ?? Prisma.JsonNull,
      },
      update: {
        value: new Prisma.Decimal(point.value),
        sourcePayload: point.sourcePayload ?? Prisma.JsonNull,
      },
      select: {
        id: true,
        indicatorCode: true,
        observedAt: true,
        value: true,
        sourcePayload: true,
        createdAt: true,
      },
    });

    if (existing) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    records.push(toRecord(persisted));
  }

  return {
    persistedCount: records.length,
    createdCount,
    updatedCount,
    records,
  };
}
