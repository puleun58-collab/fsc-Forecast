import { fetchOpinetDieselDailyHistory } from './fetch-daily-history';
import { fetchPublishedOpinetMonthlyDieselPrices } from './fetch-monthly-price';
import { fetchPublishedOpinetQuarterlyDieselPrices } from './fetch-quarterly-price';
import { fetchPublishedOpinetWeeklyDieselPrices } from './fetch-weekly-price';
import { saveDailySeries, type DailyDieselSeriesEntry } from './save-daily-series';
import { saveMonthlySeries } from './save-monthly-series';
import { saveQuarterlySeries } from './save-quarterly-series';
import { saveWeeklySeries } from './save-weekly-series';
import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselPriceRow,
  NormalizedDieselQuarterlyPriceRow,
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
  quarterly: {
    fetchedCount: number;
    savedCount: number;
  };
}

interface RefreshOpinetSeriesCacheDeps {
  fetchDaily?: (fetchImpl?: typeof fetch) => Promise<NormalizedDieselPriceRow[]>;
  fetchWeekly?: (options: {}, fetchImpl?: typeof fetch) => Promise<NormalizedDieselWeeklyPriceRow[]>;
  fetchMonthly?: (options: {}, fetchImpl?: typeof fetch) => Promise<NormalizedDieselMonthlyPriceRow[]>;
  fetchQuarterly?: (options: {}, fetchImpl?: typeof fetch) => Promise<NormalizedDieselQuarterlyPriceRow[]>;
  saveDaily?: (entries: DailyDieselSeriesEntry[]) => Promise<DailyDieselSeriesEntry[]>;
  saveWeekly?: (entries: NormalizedDieselWeeklyPriceRow[]) => Promise<NormalizedDieselWeeklyPriceRow[]>;
  saveMonthly?: (entries: NormalizedDieselMonthlyPriceRow[]) => Promise<NormalizedDieselMonthlyPriceRow[]>;
  saveQuarterly?: (entries: NormalizedDieselQuarterlyPriceRow[]) => Promise<NormalizedDieselQuarterlyPriceRow[]>;
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
  fetchQuarterly: fetchPublishedOpinetQuarterlyDieselPrices,
  saveDaily: saveDailySeries,
  saveWeekly: saveWeeklySeries,
  saveMonthly: saveMonthlySeries,
  saveQuarterly: saveQuarterlySeries,
};

export async function refreshOpinetSeriesCache(
  input: RefreshOpinetSeriesCacheInput = {},
): Promise<RefreshOpinetSeriesCacheSummary> {
  const deps = {
    ...defaultDeps,
    ...input.deps,
  };

  const dailyEntries = input.dailyEntries ?? (await deps.fetchDaily(input.fetchImpl));
  const [weeklyEntries, monthlyEntries, quarterlyEntries] = await Promise.all([
    deps.fetchWeekly({}, input.fetchImpl),
    deps.fetchMonthly({}, input.fetchImpl),
    deps.fetchQuarterly({}, input.fetchImpl),
  ]);
  const [savedDailyEntries, savedWeeklyEntries, savedMonthlyEntries, savedQuarterlyEntries] = await Promise.all([
    deps.saveDaily(dailyEntries),
    deps.saveWeekly(weeklyEntries),
    deps.saveMonthly(monthlyEntries),
    deps.saveQuarterly(quarterlyEntries),
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
    quarterly: {
      fetchedCount: quarterlyEntries.length,
      savedCount: savedQuarterlyEntries.length,
    },
  };
}
