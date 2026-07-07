import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DailyDieselSeriesEntry {
  date: string;
  productCode: string;
  productName: string;
  price: number;
  diff: number;
  source: string;
  fetchedAt: string;
}

const OUTPUT_PATH = path.join(process.cwd(), "data", "oil-price-daily.json");

function compareByDateAscending(
  left: DailyDieselSeriesEntry,
  right: DailyDieselSeriesEntry,
): number {
  return left.date.localeCompare(right.date);
}

function toSeriesEntry(value: unknown): DailyDieselSeriesEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.date !== "string" ||
    typeof candidate.productCode !== "string" ||
    typeof candidate.productName !== "string" ||
    typeof candidate.price !== "number" ||
    typeof candidate.diff !== "number" ||
    typeof candidate.source !== "string" ||
    typeof candidate.fetchedAt !== "string"
  ) {
    return null;
  }

  return {
    date: candidate.date,
    productCode: candidate.productCode,
    productName: candidate.productName,
    price: candidate.price,
    diff: candidate.diff,
    source: candidate.source,
    fetchedAt: candidate.fetchedAt,
  };
}

async function readExistingSeries(): Promise<DailyDieselSeriesEntry[]> {
  try {
    const fileContents = await readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Expected oil-price-daily.json to contain a JSON array.");
    }

    return parsed
      .map((entry) => toSeriesEntry(entry))
      .filter((entry): entry is DailyDieselSeriesEntry => entry !== null)
      .sort(compareByDateAscending);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function saveDailySeries(
  incomingEntries: DailyDieselSeriesEntry[],
): Promise<DailyDieselSeriesEntry[]> {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const existingEntries = await readExistingSeries();
  const mergedEntries = new Map<string, DailyDieselSeriesEntry>();

  for (const entry of existingEntries) {
    mergedEntries.set(entry.date, entry);
  }

  for (const entry of incomingEntries) {
    mergedEntries.set(entry.date, {
      date: entry.date,
      productCode: entry.productCode,
      productName: entry.productName,
      price: entry.price,
      diff: entry.diff,
      source: entry.source,
      fetchedAt: entry.fetchedAt,
    });
  }

  const sortedEntries = Array.from(mergedEntries.values()).sort(compareByDateAscending);

  await writeFile(OUTPUT_PATH, `${JSON.stringify(sortedEntries, null, 2)}\n`, "utf8");

  return sortedEntries;
}
