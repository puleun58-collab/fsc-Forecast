import { fetchOpinetStatsCsv, fetchOpinetStatsPageState, parseLatestWeeklyToken } from "./fetch-stats-csv";
import { normalizeWeeklyDieselRow, parseWeeklyLabel } from "./normalize-diesel";
import type { NormalizedDieselWeeklyPriceRow } from "./types";

interface FetchPublishedWeeklyOptions {
  startYear?: number;
  startMonth?: number;
}

export async function fetchPublishedOpinetWeeklyDieselPrices(
  options: FetchPublishedWeeklyOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselWeeklyPriceRow[]> {
  const state = await fetchOpinetStatsPageState(fetchImpl);
  const latest = parseLatestWeeklyToken(state.maxWeek);
  const startYear = options.startYear ?? latest.year - 1;
  const startMonth = options.startMonth ?? 1;
  const fetchedAt = new Date().toISOString();
  const rows = await fetchOpinetStatsCsv(
    {
      term: "W",
      startYear,
      startMonth,
      startWeek: 1,
      endYear: latest.year,
      endMonth: latest.month,
      endWeek: latest.week,
    },
    fetchImpl,
  );

  return rows
    .map((row) => {
      const parsed = parseWeeklyLabel(row.label);
      return normalizeWeeklyDieselRow(
        {
          year: parsed.year,
          month: parsed.month,
          week: parsed.week,
          label: row.label,
          price: row.price,
        },
        fetchedAt,
      );
    })
    .sort((left, right) => left.weekKey.localeCompare(right.weekKey));
}

export async function fetchLatestOpinetWeeklyDieselPrice(
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselWeeklyPriceRow[]> {
  const rows = await fetchPublishedOpinetWeeklyDieselPrices({}, fetchImpl);
  const latest = rows.at(-1);

  if (!latest) {
    throw new Error("Opinet weekly diesel collector could not find a published weekly average.");
  }

  return [latest];
}
