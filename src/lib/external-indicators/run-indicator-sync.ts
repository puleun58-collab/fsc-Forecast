import type { Prisma } from "@prisma/client";

import { getExternalIndicatorDefinition } from "./catalog";
import { selectLatestIndicatorStates } from "./latest-indicator-states";
import { persistIndicatorHistory } from "./persist-indicator-history";
import type { ExternalIndicatorProviderResult } from "./provider-contract";
import type { ExternalIndicatorPoint, IndicatorSyncResult } from "./types";

interface RunIndicatorSyncInput {
  providerResult: ExternalIndicatorProviderResult;
  tx?: Prisma.TransactionClient;
}

function comparePoints(left: ExternalIndicatorPoint, right: ExternalIndicatorPoint): number {
  const indicatorComparison = left.indicatorCode.localeCompare(right.indicatorCode);

  if (indicatorComparison !== 0) {
    return indicatorComparison;
  }

  return left.observedAt.getTime() - right.observedAt.getTime();
}

function createPointKey(point: ExternalIndicatorPoint): string {
  return `${point.indicatorCode}:${point.observedAt.toISOString()}`;
}

function hasSameSourcePayload(left: ExternalIndicatorPoint, right: ExternalIndicatorPoint): boolean {
  return JSON.stringify(left.sourcePayload ?? null) === JSON.stringify(right.sourcePayload ?? null);
}

function normalizePoints(points: readonly ExternalIndicatorPoint[]): ExternalIndicatorPoint[] {
  const normalized = [...points].sort(comparePoints);
  const deduplicated: ExternalIndicatorPoint[] = [];
  const pointsByKey = new Map<string, ExternalIndicatorPoint>();

  for (const point of normalized) {
    getExternalIndicatorDefinition(point.indicatorCode);

    if (Number.isNaN(point.observedAt.getTime())) {
      throw new Error(`Indicator observedAt must be a valid Date for '${point.indicatorCode}'.`);
    }

    if (!Number.isFinite(point.value)) {
      throw new Error(`Indicator value must be finite for '${point.indicatorCode}'.`);
    }

    const key = createPointKey(point);
    const existing = pointsByKey.get(key);

    if (!existing) {
      pointsByKey.set(key, point);
      deduplicated.push(point);
      continue;
    }

    if (existing.value !== point.value || !hasSameSourcePayload(existing, point)) {
      throw new Error(
        `Conflicting indicator points received for '${point.indicatorCode}' at '${point.observedAt.toISOString()}'.`,
      );
    }
  }

  return deduplicated;
}

export async function runIndicatorSync(
  input: RunIndicatorSyncInput,
): Promise<IndicatorSyncResult> {
  if (!input.providerResult.providerKey.trim()) {
    throw new Error("Indicator sync requires a non-empty providerKey.");
  }

  const normalizedPoints = normalizePoints(input.providerResult.points);
  const collectedAt = new Date();
  const persisted = await persistIndicatorHistory({
    points: normalizedPoints,
    tx: input.tx,
    collectedAt,
  });

  return {
    providerKey: input.providerResult.providerKey,
    persistedCount: persisted.persistedCount,
    createdCount: persisted.createdCount,
    updatedCount: persisted.updatedCount,
    acceptedPointCount: normalizedPoints.length,
    records: persisted.records,
    latestStates: selectLatestIndicatorStates(persisted.records),
  };
}
