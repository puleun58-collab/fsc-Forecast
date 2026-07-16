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
  collectedAt?: Date;
}

interface ExistingIndicatorRow {
  id: string;
  indicatorCode: string;
  observedAt: Date;
  value: Prisma.Decimal;
  sourcePayload: Prisma.JsonValue | null;
  createdAt: Date;
  collectedAt: Date;
}

function comparePoints(left: ExternalIndicatorPoint, right: ExternalIndicatorPoint): number {
  const indicatorComparison = left.indicatorCode.localeCompare(right.indicatorCode);

  if (indicatorComparison !== 0) {
    return indicatorComparison;
  }

  return left.observedAt.getTime() - right.observedAt.getTime();
}

function toRecord(row: ExistingIndicatorRow): ExternalIndicatorHistoryRecord {
  return {
    id: row.id,
    indicatorCode: row.indicatorCode as ExternalIndicatorHistoryRecord["indicatorCode"],
    observedAt: row.observedAt,
    value: Number(row.value),
    sourcePayload: row.sourcePayload,
    createdAt: row.createdAt,
    collectedAt: row.collectedAt,
  };
}

function createPointKey(point: { indicatorCode: string; observedAt: Date }): string {
  return `${point.indicatorCode}:${point.observedAt.toISOString()}`;
}

function normalizeSourcePayload(value: Prisma.JsonValue | Prisma.InputJsonValue | undefined): string {
  return JSON.stringify(value ?? null);
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size) as T[]);
  }

  return chunks;
}

export async function persistIndicatorHistory(
  input: PersistIndicatorHistoryInput,
): Promise<PersistIndicatorHistoryResult> {
  const tx = input.tx ?? db;
  const collectedAt = input.collectedAt ?? new Date();
  const points = [...input.points].sort(comparePoints);
  let createdCount = 0;
  let updatedCount = 0;

  if (Number.isNaN(collectedAt.getTime())) {
    throw new Error("Indicator history persistence requires a valid collectedAt value.");
  }

  for (const point of points) {
    getExternalIndicatorDefinition(point.indicatorCode);

    if (Number.isNaN(point.observedAt.getTime())) {
      throw new Error(`Indicator observedAt must be a valid Date for '${point.indicatorCode}'.`);
    }

    if (!Number.isFinite(point.value)) {
      throw new Error(`Indicator value must be finite for '${point.indicatorCode}'.`);
    }
  }

  if (points.length === 0) {
    return {
      persistedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      records: [],
    };
  }

  const pointsByCode = new Map<string, ExternalIndicatorPoint[]>();

  for (const point of points) {
    const existing = pointsByCode.get(point.indicatorCode);

    if (existing) {
      existing.push(point);
    } else {
      pointsByCode.set(point.indicatorCode, [point]);
    }
  }

  const existingRowsByKey = new Map<string, ExistingIndicatorRow>();

  for (const [indicatorCode, codePoints] of pointsByCode) {
    const observedTimes = codePoints.map((point) => point.observedAt.getTime());
    const minObservedAt = new Date(Math.min(...observedTimes));
    const maxObservedAt = new Date(Math.max(...observedTimes));

    const rows = await tx.externalIndicatorHistory.findMany({
      where: {
        indicatorCode,
        observedAt: {
          gte: minObservedAt,
          lte: maxObservedAt,
        },
      },
      select: {
        id: true,
        indicatorCode: true,
        observedAt: true,
        value: true,
        sourcePayload: true,
        createdAt: true,
        collectedAt: true,
      },
    });

    for (const row of rows) {
      existingRowsByKey.set(createPointKey(row), row);
    }
  }

  const creates = points.filter((point) => !existingRowsByKey.has(createPointKey(point)));
  const updates = points.filter((point) => {
    const existing = existingRowsByKey.get(createPointKey(point));

    if (!existing) {
      return false;
    }

    return (
      Number(existing.value) !== point.value ||
      normalizeSourcePayload(existing.sourcePayload) !== normalizeSourcePayload(point.sourcePayload)
    );
  });
  const latestExistingTouches: ExternalIndicatorPoint[] = [];

  for (const codePoints of pointsByCode.values()) {
    const latestPoint = codePoints[codePoints.length - 1];

    if (!latestPoint) {
      continue;
    }

    const existing = existingRowsByKey.get(createPointKey(latestPoint));

    if (!existing) {
      continue;
    }

    const hasValueOrPayloadUpdate = updates.some(
      (updatePoint) =>
        updatePoint.indicatorCode === latestPoint.indicatorCode &&
        updatePoint.observedAt.getTime() === latestPoint.observedAt.getTime(),
    );

    if (!hasValueOrPayloadUpdate) {
      latestExistingTouches.push(latestPoint);
    }
  }

  for (const chunk of chunkArray(creates, 500)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.externalIndicatorHistory.createMany({
      data: chunk.map((point) => ({
        indicatorCode: point.indicatorCode,
        observedAt: point.observedAt,
        value: new Prisma.Decimal(point.value),
        sourcePayload: point.sourcePayload ?? Prisma.JsonNull,
        collectedAt,
      })),
      skipDuplicates: true,
    });

    createdCount += chunk.length;
  }

  for (const point of updates) {
    await tx.externalIndicatorHistory.update({
      where: {
        indicatorCode_observedAt: {
          indicatorCode: point.indicatorCode,
          observedAt: point.observedAt,
        },
      },
      data: {
        value: new Prisma.Decimal(point.value),
        sourcePayload: point.sourcePayload ?? Prisma.JsonNull,
        collectedAt,
      },
    });

    updatedCount += 1;
  }

  for (const point of latestExistingTouches) {
    await tx.externalIndicatorHistory.update({
      where: {
        indicatorCode_observedAt: {
          indicatorCode: point.indicatorCode,
          observedAt: point.observedAt,
        },
      },
      data: {
        collectedAt,
      },
    });
  }

  const persistedRowsByKey = new Map<string, ExistingIndicatorRow>();

  for (const [indicatorCode, codePoints] of pointsByCode) {
    const observedTimes = codePoints.map((point) => point.observedAt.getTime());
    const minObservedAt = new Date(Math.min(...observedTimes));
    const maxObservedAt = new Date(Math.max(...observedTimes));
    const requiredKeys = new Set(codePoints.map((point) => createPointKey(point)));

    const rows = await tx.externalIndicatorHistory.findMany({
      where: {
        indicatorCode,
        observedAt: {
          gte: minObservedAt,
          lte: maxObservedAt,
        },
      },
      select: {
        id: true,
        indicatorCode: true,
        observedAt: true,
        value: true,
        sourcePayload: true,
        createdAt: true,
        collectedAt: true,
      },
    });

    for (const row of rows) {
      const key = createPointKey(row);

      if (requiredKeys.has(key)) {
        persistedRowsByKey.set(key, row);
      }
    }
  }

  const records = points.map((point) => {
    const row = persistedRowsByKey.get(createPointKey(point));

    if (!row) {
      throw new Error(
        `Failed to reload persisted indicator row for '${point.indicatorCode}' at '${point.observedAt.toISOString()}'.`,
      );
    }

    return toRecord(row);
  });

  return {
    persistedCount: records.length,
    createdCount,
    updatedCount,
    records,
  };
}
