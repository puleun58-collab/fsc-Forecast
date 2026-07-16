import type { NormalizedDieselPriceRow } from "./types";
import { fetchOpinetAverageDieselPrices } from "./fetch-avg-price";
import { fetchOpinetRecentDieselPrices } from "./fetch-recent-price";

function compareByDateAscending(left: NormalizedDieselPriceRow, right: NormalizedDieselPriceRow): number {
  return left.date.localeCompare(right.date);
}

export function mergeOpinetDieselDailyHistory(
  currentRows: readonly NormalizedDieselPriceRow[],
  recentRows: readonly NormalizedDieselPriceRow[],
): NormalizedDieselPriceRow[] {
  const mergedRows = new Map<string, NormalizedDieselPriceRow>();

  for (const row of recentRows) {
    mergedRows.set(row.date, row);
  }

  for (const row of currentRows) {
    mergedRows.set(row.date, row);
  }

  return Array.from(mergedRows.values()).sort(compareByDateAscending);
}

export async function fetchOpinetDieselDailyHistory(
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselPriceRow[]> {
  const currentRows = await fetchOpinetAverageDieselPrices(fetchImpl);

  let recentRows: NormalizedDieselPriceRow[] = [];

  try {
    recentRows = await fetchOpinetRecentDieselPrices(fetchImpl);
  } catch {
    recentRows = [];
  }

  return mergeOpinetDieselDailyHistory(currentRows, recentRows);
}
