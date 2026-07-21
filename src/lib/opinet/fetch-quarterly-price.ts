import { fetchOpinetStatsCsv } from './fetch-stats-csv';
import { normalizeQuarterlyDieselRow, parseQuarterlyLabel } from './normalize-diesel';

import type { NormalizedDieselQuarterlyPriceRow } from './types';

interface FetchPublishedQuarterlyOptions {
  readonly startYear?: number;
  readonly startQuarter?: number;
  readonly endYear?: number;
  readonly endQuarter?: number;
  readonly now?: Date;
}

function resolveLatestCompletedQuarter(now: Date): { readonly year: number; readonly quarter: number } {
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;

  if (currentQuarter === 1) {
    return { year: now.getUTCFullYear() - 1, quarter: 4 };
  }

  return { year: now.getUTCFullYear(), quarter: currentQuarter - 1 };
}

export async function fetchPublishedOpinetQuarterlyDieselPrices(
  options: FetchPublishedQuarterlyOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselQuarterlyPriceRow[]> {
  const latestCompleted = resolveLatestCompletedQuarter(options.now ?? new Date());
  const endYear = options.endYear ?? latestCompleted.year;
  const endQuarter = options.endQuarter ?? latestCompleted.quarter;
  const startYear = options.startYear ?? endYear - 1;
  const startQuarter = options.startQuarter ?? 1;
  const fetchedAt = new Date().toISOString();
  const rows = await fetchOpinetStatsCsv(
    {
      term: 'Q',
      startYear,
      startMonth: (startQuarter - 1) * 3 + 1,
      startQuarter,
      endYear,
      endMonth: endQuarter * 3,
      endQuarter,
    },
    fetchImpl,
  );

  return rows
    .map((row) => {
      const parsed = parseQuarterlyLabel(row.label);
      return normalizeQuarterlyDieselRow(
        {
          year: parsed.year,
          quarter: parsed.quarter,
          label: row.label,
          price: row.price,
        },
        fetchedAt,
      );
    })
    .sort((left, right) => left.quarterKey.localeCompare(right.quarterKey));
}
