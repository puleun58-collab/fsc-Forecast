import { fetchOpinetStatsCsv } from "./fetch-stats-csv";
import { normalizeMonthlyDieselRow, parseMonthlyLabel } from "./normalize-diesel";
import type { NormalizedDieselMonthlyPriceRow } from "./types";

interface FetchPublishedMonthlyOptions {
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  now?: Date;
}

function resolveLatestPublishedMonthlyPeriod(now: Date): { year: number; month: number } {
  const normalized = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthsBack = normalized.getUTCDate() <= 7 ? 2 : 1;
  const endDate = new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth() - monthsBack, 1));

  return {
    year: endDate.getUTCFullYear(),
    month: endDate.getUTCMonth() + 1,
  };
}

export async function fetchPublishedOpinetMonthlyDieselPrices(
  options: FetchPublishedMonthlyOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselMonthlyPriceRow[]> {
  const latestPublished = resolveLatestPublishedMonthlyPeriod(options.now ?? new Date());
  const endYear = options.endYear ?? latestPublished.year;
  const endMonth = options.endMonth ?? latestPublished.month;
  const startYear = options.startYear ?? endYear - 1;
  const startMonth = options.startMonth ?? 1;
  const fetchedAt = new Date().toISOString();
  const rows = await fetchOpinetStatsCsv(
    {
      term: "M",
      startYear,
      startMonth,
      endYear,
      endMonth,
    },
    fetchImpl,
  );

  return rows
    .map((row) => {
      const parsed = parseMonthlyLabel(row.label);
      return normalizeMonthlyDieselRow(
        {
          year: parsed.year,
          month: parsed.month,
          label: row.label,
          price: row.price,
        },
        fetchedAt,
      );
    })
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}
