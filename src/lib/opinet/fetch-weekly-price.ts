import { normalizeWeeklyDieselRow } from "./normalize-diesel";
import {
  fetchOpinetStatsCsv,
  fetchOpinetStatsPageState,
  getPreviousWeeklyToken,
  parseLatestWeeklyToken,
} from "./fetch-stats-csv";
import type { NormalizedDieselWeeklyPriceRow } from "./types";

export async function fetchLatestOpinetWeeklyDieselPrice(
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselWeeklyPriceRow[]> {
  const state = await fetchOpinetStatsPageState(fetchImpl);
  const fetchedAt = new Date().toISOString();
  let candidate = parseLatestWeeklyToken(state.maxWeek);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const rows = await fetchOpinetStatsCsv({
      term: "W",
      startYear: candidate.year,
      startMonth: candidate.month,
      startWeek: candidate.week,
      endYear: candidate.year,
      endMonth: candidate.month,
      endWeek: candidate.week,
    }, fetchImpl);

    if (rows.length > 0) {
      return rows.map((row) => normalizeWeeklyDieselRow({
        year: candidate.year,
        month: candidate.month,
        week: candidate.week,
        label: row.label,
        price: row.price,
      }, fetchedAt));
    }

    candidate = getPreviousWeeklyToken(candidate);
  }

  throw new Error("Opinet weekly diesel collector could not find a published weekly average in the recent search window.");
}
