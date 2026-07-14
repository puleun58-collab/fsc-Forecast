import { fetchOpinetDieselDailyHistory } from './fetch-daily-history';
import { fetchPublishedOpinetMonthlyDieselPrices } from './fetch-monthly-price';
import { fetchPublishedOpinetWeeklyDieselPrices } from './fetch-weekly-price';
import { saveDailySeries, type DailyDieselSeriesEntry } from './save-daily-series';
import { saveMonthlySeries } from './save-monthly-series';
import { saveWeeklySeries } from './save-weekly-series';
import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselPriceRow,
  NormalizedDieselWeeklyPriceRow,
} from './types';

export interface RefreshOpinetSeriesCacheSummary {
  daily: {
    fetchedCount: number;
    savedCount: number;
  };
  weekly: {
    fetchedCount: number;
    savedCount: number;
  };
  monthly: {
    fetchedCount: number;
    savedCount: number;
  };
}

interface RefreshOpinetSeriesCacheDeps {
  fetchDaily?: (fetchImpl?: typeof fetch) => Promise<NormalizedDieselPriceRow[]>;
  fetchWeekly?: (options: {}, fetchImpl?: typeof fetch) => Promise<NormalizedDieselWeeklyPriceRow[]>;
  fetchMonthly?: (options: {}, fetchImpl?: typeof fetch) => Promise<NormalizedDieselMonthlyPriceRow[]>;
  saveDaily?: (entries: DailyDieselSeriesEntry[]) => Promise<DailyDieselSeriesEntry[]>;
  saveWeekly?: (entries: NormalizedDieselWeeklyPriceRow[]) => Promise<NormalizedDieselWeeklyPriceRow[]>;
  saveMonthly?: (entries: NormalizedDieselMonthlyPriceRow[]) => Promise<NormalizedDieselMonthlyPriceRow[]>;
}

export interface RefreshOpinetSeriesCacheInput {
  fetchImpl?: typeof fetch;
  dailyEntries?: NormalizedDieselPriceRow[];
  deps?: RefreshOpinetSeriesCacheDeps;
}

const defaultDeps: Required<RefreshOpinetSeriesCacheDeps> = {
  fetchDaily: fetchOpinetDieselDailyHistory,
  fetchWeekly: fetchPublishedOpinetWeeklyDieselPrices,
  fetchMonthly: fetchPublishedOpinetMonthlyDieselPrices,
  saveDaily: saveDailySeries,
  saveWeekly: saveWeeklySeries,
  saveMonthly: saveMonthlySeries,
};

export async function refreshOpinetSeriesCache(
  input: RefreshOpinetSeriesCacheInput = {},
): Promise<RefreshOpinetSeriesCacheSummary> {
  const deps = {
    ...defaultDeps,
    ...input.deps,
  };

  const dailyEntries = input.dailyEntries ?? (await deps.fetchDaily(input.fetchImpl));
  const [weeklyEntries, monthlyEntries] = await Promise.all([
    deps.fetchWeekly({}, input.fetchImpl),
    deps.fetchMonthly({}, input.fetchImpl),
  ]);
  const [savedDailyEntries, savedWeeklyEntries, savedMonthlyEntries] = await Promise.all([
    deps.saveDaily(dailyEntries),
    deps.saveWeekly(weeklyEntries),
    deps.saveMonthly(monthlyEntries),
  ]);

  return {
    daily: {
      fetchedCount: dailyEntries.length,
      savedCount: savedDailyEntries.length,
    },
    weekly: {
      fetchedCount: weeklyEntries.length,
      savedCount: savedWeeklyEntries.length,
    },
    monthly: {
      fetchedCount: monthlyEntries.length,
      savedCount: savedMonthlyEntries.length,
    },
  };
}
