import type { Prisma } from "@prisma/client";

import { db } from "../db";
import type { NormalizedDieselPriceRow } from "../opinet/types";
import type { ReconcileDailyPricesResult } from "./types";
import { OPINET_DATASET_KEY } from "./types";

interface ReconcileDailyPricesInput {
  ingestRunId: string;
  rows: NormalizedDieselPriceRow[];
  tx?: Prisma.TransactionClient;
}

function parseTradeDate(value: string): Date {
  const normalized = value.trim();

  if (!/^\d{8}$/.test(normalized)) {
    throw new Error(`Opinet trade date must be YYYYMMDD, received '${value}'.`);
  }

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6)) - 1;
  const day = Number(normalized.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Opinet trade date is invalid: '${value}'.`);
  }

  return date;
}

function parseFetchedAt(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Opinet fetchedAt timestamp is invalid: '${value}'.`);
  }

  return date;
}

function createSourceRevisionToken(row: NormalizedDieselPriceRow): string {
  return [
    row.source,
    row.productCode,
    row.productName,
    row.date,
    String(row.price),
    String(row.diff),
  ].join(":");
}

function toSourcePayload(row: NormalizedDieselPriceRow): Prisma.InputJsonObject {
  return {
    date: row.date,
    productCode: row.productCode,
    productName: row.productName,
    price: row.price,
    diff: row.diff,
    source: row.source,
    fetchedAt: row.fetchedAt,
  };
}

function createComparableSourceSignature(value: {
  date: string;
  productCode: string;
  productName: string;
  price: number;
  diff: number;
  source: string;
}): string {
  return JSON.stringify({
    date: value.date,
    productCode: value.productCode,
    productName: value.productName,
    price: value.price,
    diff: value.diff,
    source: value.source,
  });
}

function assertDistinctPriceDates(rows: NormalizedDieselPriceRow[]): void {
  const seenDates = new Set<string>();

  for (const row of rows) {
    if (seenDates.has(row.date)) {
      throw new Error(`Duplicate Opinet diesel row received for price date '${row.date}'.`);
    }

    seenDates.add(row.date);
  }
}

export async function reconcileDailyPrices(
  input: ReconcileDailyPricesInput,
): Promise<ReconcileDailyPricesResult> {
  assertDistinctPriceDates(input.rows);

  const tx = input.tx ?? db;
  const rows = [...input.rows].sort((left, right) => left.date.localeCompare(right.date));
  const priceDates = rows.map((row) => parseTradeDate(row.date));
  const existingCurrentRows = await tx.dailyPriceCurrent.findMany({
    where: {
      datasetKey: OPINET_DATASET_KEY,
      priceDate: {
        in: priceDates,
      },
    },
    include: {
      currentRevision: true,
    },
  });
  const currentRowsByDate = new Map(
    existingCurrentRows.map((row) => [row.priceDate.toISOString(), row]),
  );
  const changes: ReconcileDailyPricesResult["changes"] = [];
  let createdRevisionCount = 0;
  let supersededRevisionCount = 0;
  let unchangedRowCount = 0;

  for (const row of rows) {
    const priceDate = parseTradeDate(row.date);
    const priceDateKey = priceDate.toISOString();
    const fetchedAt = parseFetchedAt(row.fetchedAt);
    const sourceRevisionToken = createSourceRevisionToken(row);
    const sourcePayload = toSourcePayload(row);
    const existingCurrent = currentRowsByDate.get(priceDateKey);

    if (!existingCurrent) {
      const createdRevision = await tx.priceRevisionLog.create({
        data: {
          datasetKey: OPINET_DATASET_KEY,
          priceDate,
          observedPriceKrwPerL: row.price,
          sourceObservedAt: fetchedAt,
          sourceRevisionToken,
          sourcePayload,
          ingestRunId: input.ingestRunId,
        },
      });
      const createdCurrent = await tx.dailyPriceCurrent.create({
        data: {
          datasetKey: OPINET_DATASET_KEY,
          priceDate,
          currentRevisionId: createdRevision.id,
        },
      });

      currentRowsByDate.set(priceDateKey, {
        ...createdCurrent,
        currentRevision: createdRevision,
      });
      createdRevisionCount += 1;
      changes.push({
        action: "created",
        priceDate: row.date,
        observedPriceKrwPerL: row.price,
        currentRevisionId: createdRevision.id,
        previousRevisionId: null,
      });
      continue;
    }

    const currentRevision = existingCurrent.currentRevision;
    const isSamePrice = Number(currentRevision.observedPriceKrwPerL) === row.price;
    const isSameRevisionToken = currentRevision.sourceRevisionToken === sourceRevisionToken;
    const isSamePayload = createComparableSourceSignature({
      date: row.date,
      productCode: row.productCode,
      productName: row.productName,
      price: row.price,
      diff: row.diff,
      source: row.source,
    }) === createComparableSourceSignature({
      date: String((currentRevision.sourcePayload as Record<string, unknown> | null)?.date ?? row.date),
      productCode: String((currentRevision.sourcePayload as Record<string, unknown> | null)?.productCode ?? row.productCode),
      productName: String((currentRevision.sourcePayload as Record<string, unknown> | null)?.productName ?? row.productName),
      price: Number((currentRevision.sourcePayload as Record<string, unknown> | null)?.price ?? row.price),
      diff: Number((currentRevision.sourcePayload as Record<string, unknown> | null)?.diff ?? row.diff),
      source: String((currentRevision.sourcePayload as Record<string, unknown> | null)?.source ?? row.source),
    });

    if (isSamePrice && isSameRevisionToken && isSamePayload) {
      unchangedRowCount += 1;
      changes.push({
        action: "unchanged",
        priceDate: row.date,
        observedPriceKrwPerL: row.price,
        currentRevisionId: currentRevision.id,
        previousRevisionId: currentRevision.id,
      });
      continue;
    }

    const replacementRevision = await tx.priceRevisionLog.create({
      data: {
        datasetKey: OPINET_DATASET_KEY,
        priceDate,
        observedPriceKrwPerL: row.price,
        sourceObservedAt: fetchedAt,
        sourceRevisionToken,
        sourcePayload,
        ingestRunId: input.ingestRunId,
        supersedesRevisionId: currentRevision.id,
      },
    });

    await tx.dailyPriceCurrent.update({
      where: {
        id: existingCurrent.id,
      },
      data: {
        currentRevisionId: replacementRevision.id,
      },
    });

    currentRowsByDate.set(priceDateKey, {
      ...existingCurrent,
      currentRevisionId: replacementRevision.id,
      currentRevision: replacementRevision,
    });
    createdRevisionCount += 1;
    supersededRevisionCount += 1;
    changes.push({
      action: "updated",
      priceDate: row.date,
      observedPriceKrwPerL: row.price,
      currentRevisionId: replacementRevision.id,
      previousRevisionId: currentRevision.id,
    });
  }

  const latestCurrentRows = await tx.dailyPriceCurrent.findMany({
    where: {
      datasetKey: OPINET_DATASET_KEY,
    },
    orderBy: {
      priceDate: "asc",
    },
    select: {
      currentRevisionId: true,
    },
  });

  return {
    datasetKey: OPINET_DATASET_KEY,
    ingestRunId: input.ingestRunId,
    processedRowCount: rows.length,
    createdRevisionCount,
    supersededRevisionCount,
    unchangedRowCount,
    currentRowCount: latestCurrentRows.length,
    changes,
    latestCurrentRevisionIds: latestCurrentRows.map((row) => row.currentRevisionId),
  };
}
