import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NormalizedDieselWeeklyPriceRow } from "./types";

const OUTPUT_PATH = path.join(process.cwd(), "data", "oil-price-weekly.json");

function compareByWeekKeyAscending(
  left: NormalizedDieselWeeklyPriceRow,
  right: NormalizedDieselWeeklyPriceRow,
): number {
  return left.weekKey.localeCompare(right.weekKey);
}

function toWeeklySeriesEntry(value: unknown): NormalizedDieselWeeklyPriceRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.weekKey !== "string" ||
    typeof candidate.weekLabel !== "string" ||
    typeof candidate.weekStartDate !== "string" ||
    typeof candidate.weekEndDate !== "string" ||
    typeof candidate.productCode !== "string" ||
    typeof candidate.productName !== "string" ||
    typeof candidate.price !== "number" ||
    typeof candidate.source !== "string" ||
    typeof candidate.fetchedAt !== "string"
  ) {
    return null;
  }

  return {
    weekKey: candidate.weekKey,
    weekLabel: candidate.weekLabel,
    weekStartDate: candidate.weekStartDate,
    weekEndDate: candidate.weekEndDate,
    productCode: candidate.productCode,
    productName: candidate.productName,
    price: candidate.price,
    source: candidate.source,
    fetchedAt: candidate.fetchedAt,
  };
}

export async function readWeeklySeries(): Promise<NormalizedDieselWeeklyPriceRow[]> {
  try {
    const fileContents = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Expected oil-price-weekly.json to contain a JSON array.");
    }

    return parsed
      .map((entry) => toWeeklySeriesEntry(entry))
      .filter((entry): entry is NormalizedDieselWeeklyPriceRow => entry !== null)
      .sort(compareByWeekKeyAscending);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function saveWeeklySeries(
  incomingEntries: NormalizedDieselWeeklyPriceRow[],
): Promise<NormalizedDieselWeeklyPriceRow[]> {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const existingEntries = await readWeeklySeries();
  const mergedEntries = new Map<string, NormalizedDieselWeeklyPriceRow>();

  for (const entry of existingEntries) {
    mergedEntries.set(entry.weekKey, entry);
  }

  for (const entry of incomingEntries) {
    mergedEntries.set(entry.weekKey, {
      weekKey: entry.weekKey,
      weekLabel: entry.weekLabel,
      weekStartDate: entry.weekStartDate,
      weekEndDate: entry.weekEndDate,
      productCode: entry.productCode,
      productName: entry.productName,
      price: entry.price,
      source: entry.source,
      fetchedAt: entry.fetchedAt,
    });
  }

  const sortedEntries = Array.from(mergedEntries.values()).sort(compareByWeekKeyAscending);

  await writeFile(OUTPUT_PATH, `${JSON.stringify(sortedEntries, null, 2)}\n`, "utf8");

  return sortedEntries;
}
