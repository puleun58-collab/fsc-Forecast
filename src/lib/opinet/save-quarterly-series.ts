import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { NormalizedDieselQuarterlyPriceRow } from './types';

const OUTPUT_PATH = path.join(process.cwd(), 'data', 'oil-price-quarterly.json');

function isQuarterlySeriesEntry(value: unknown): value is NormalizedDieselQuarterlyPriceRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.quarterKey === 'string'
    && typeof candidate.quarterLabel === 'string'
    && typeof candidate.quarterStartDate === 'string'
    && typeof candidate.quarterEndDate === 'string'
    && typeof candidate.productCode === 'string'
    && typeof candidate.productName === 'string'
    && typeof candidate.price === 'number'
    && typeof candidate.source === 'string'
    && typeof candidate.fetchedAt === 'string';
}

export async function readQuarterlySeries(): Promise<NormalizedDieselQuarterlyPriceRow[]> {
  try {
    const parsed = JSON.parse(await readFile(OUTPUT_PATH, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Expected oil-price-quarterly.json to contain a JSON array.');
    }

    return parsed
      .filter(isQuarterlySeriesEntry)
      .sort((left, right) => left.quarterKey.localeCompare(right.quarterKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function saveQuarterlySeries(
  incomingEntries: NormalizedDieselQuarterlyPriceRow[],
): Promise<NormalizedDieselQuarterlyPriceRow[]> {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const mergedEntries = new Map(
    (await readQuarterlySeries()).map((entry) => [entry.quarterKey, entry]),
  );

  for (const entry of incomingEntries) {
    mergedEntries.set(entry.quarterKey, entry);
  }

  const entries = Array.from(mergedEntries.values())
    .sort((left, right) => left.quarterKey.localeCompare(right.quarterKey));
  await writeFile(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  return entries;
}
