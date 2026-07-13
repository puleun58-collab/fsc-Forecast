import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NormalizedDieselMonthlyPriceRow } from "./types";

const OUTPUT_PATH = path.join(process.cwd(), "data", "oil-price-monthly.json");

function compareByMonthKeyAscending(
  left: NormalizedDieselMonthlyPriceRow,
  right: NormalizedDieselMonthlyPriceRow,
): number {
  return left.monthKey.localeCompare(right.monthKey);
}

function toMonthlySeriesEntry(value: unknown): NormalizedDieselMonthlyPriceRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.monthKey !== "string" ||
    typeof candidate.monthLabel !== "string" ||
    typeof candidate.monthStartDate !== "string" ||
    typeof candidate.monthEndDate !== "string" ||
    typeof candidate.productCode !== "string" ||
    typeof candidate.productName !== "string" ||
    typeof candidate.price !== "number" ||
    typeof candidate.source !== "string" ||
    typeof candidate.fetchedAt !== "string"
  ) {
    return null;
  }

  return {
    monthKey: candidate.monthKey,
    monthLabel: candidate.monthLabel,
    monthStartDate: candidate.monthStartDate,
    monthEndDate: candidate.monthEndDate,
    productCode: candidate.productCode,
    productName: candidate.productName,
    price: candidate.price,
    source: candidate.source,
    fetchedAt: candidate.fetchedAt,
  };
}

export async function readMonthlySeries(): Promise<NormalizedDieselMonthlyPriceRow[]> {
  try {
    const fileContents = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Expected oil-price-monthly.json to contain a JSON array.");
    }

    return parsed
      .map((entry) => toMonthlySeriesEntry(entry))
      .filter((entry): entry is NormalizedDieselMonthlyPriceRow => entry !== null)
      .sort(compareByMonthKeyAscending);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function saveMonthlySeries(
  incomingEntries: NormalizedDieselMonthlyPriceRow[],
): Promise<NormalizedDieselMonthlyPriceRow[]> {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const existingEntries = await readMonthlySeries();
  const mergedEntries = new Map<string, NormalizedDieselMonthlyPriceRow>();

  for (const entry of existingEntries) {
    mergedEntries.set(entry.monthKey, entry);
  }

  for (const entry of incomingEntries) {
    mergedEntries.set(entry.monthKey, {
      monthKey: entry.monthKey,
      monthLabel: entry.monthLabel,
      monthStartDate: entry.monthStartDate,
      monthEndDate: entry.monthEndDate,
      productCode: entry.productCode,
      productName: entry.productName,
      price: entry.price,
      source: entry.source,
      fetchedAt: entry.fetchedAt,
    });
  }

  const sortedEntries = Array.from(mergedEntries.values()).sort(compareByMonthKeyAscending);

  await writeFile(OUTPUT_PATH, `${JSON.stringify(sortedEntries, null, 2)}\n`, "utf8");

  return sortedEntries;
}
