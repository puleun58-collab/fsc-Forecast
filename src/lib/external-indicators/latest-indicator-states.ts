import type { Prisma } from "@prisma/client";

import { db } from "../db";
import type {
  ExternalIndicatorCode,
  ExternalIndicatorHistoryRecord,
  LatestExternalIndicatorState,
} from "./types";

function compareStateRows(
  left: Pick<ExternalIndicatorHistoryRecord, "indicatorCode" | "observedAt" | "collectedAt">,
  right: Pick<ExternalIndicatorHistoryRecord, "indicatorCode" | "observedAt" | "collectedAt">,
): number {
  const codeComparison = left.indicatorCode.localeCompare(right.indicatorCode);

  if (codeComparison !== 0) {
    return codeComparison;
  }

  const observedComparison = right.observedAt.getTime() - left.observedAt.getTime();

  if (observedComparison !== 0) {
    return observedComparison;
  }

  return right.collectedAt.getTime() - left.collectedAt.getTime();
}

export function selectLatestIndicatorStates(
  rows: readonly Pick<ExternalIndicatorHistoryRecord, "indicatorCode" | "observedAt" | "value" | "collectedAt">[],
): LatestExternalIndicatorState[] {
  const sorted = [...rows].sort(compareStateRows);
  const latestByCode = new Map<ExternalIndicatorCode, LatestExternalIndicatorState>();

  for (const row of sorted) {
    const indicatorCode = row.indicatorCode as ExternalIndicatorCode;

    if (latestByCode.has(indicatorCode)) {
      continue;
    }

    latestByCode.set(indicatorCode, {
      indicatorCode,
      observedAt: row.observedAt,
      value: row.value,
      collectedAt: row.collectedAt,
    });
  }

  return [...latestByCode.values()].sort((left, right) => left.indicatorCode.localeCompare(right.indicatorCode));
}

export async function loadLatestIndicatorStates(
  input: {
    indicatorCodes: readonly ExternalIndicatorCode[];
    tx?: Prisma.TransactionClient;
  },
): Promise<LatestExternalIndicatorState[]> {
  const tx = input.tx ?? db;
  const rows = await tx.externalIndicatorHistory.findMany({
    where: {
      indicatorCode: {
        in: [...input.indicatorCodes],
      },
    },
    orderBy: [{ indicatorCode: "asc" }, { observedAt: "desc" }, { collectedAt: "desc" }],
    select: {
      indicatorCode: true,
      observedAt: true,
      value: true,
      collectedAt: true,
    },
  });

  return selectLatestIndicatorStates(rows.map((row) => ({
    indicatorCode: row.indicatorCode as ExternalIndicatorCode,
    observedAt: row.observedAt,
    value: Number(row.value),
    collectedAt: row.collectedAt,
  })));
}
