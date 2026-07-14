import test from 'node:test';
import assert from 'node:assert/strict';

import { refreshOpinetSeriesCache } from './refresh-series-cache';
import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselPriceRow,
  NormalizedDieselWeeklyPriceRow,
} from './types';

const dailyEntries: NormalizedDieselPriceRow[] = [
  {
    date: '20260713',
    productCode: 'D047',
    productName: '자동차용경유',
    price: 1864.81,
    diff: -1.18,
    source: 'opinet-daily-average-price',
    fetchedAt: '2026-07-14T00:00:00.000Z',
  },
];

const weeklyEntries: NormalizedDieselWeeklyPriceRow[] = [
  {
    weekKey: '2026072',
    weekLabel: '2026년07월2주',
    weekStartDate: '2026-07-05',
    weekEndDate: '2026-07-09',
    productCode: 'D047',
    productName: '자동차용경유',
    price: 1880.14,
    source: 'opinet-weekly-average-price',
    fetchedAt: '2026-07-14T00:00:00.000Z',
  },
];

const monthlyEntries: NormalizedDieselMonthlyPriceRow[] = [
  {
    monthKey: '202606',
    monthLabel: '2026년06월',
    monthStartDate: '2026-06-01',
    monthEndDate: '2026-06-30',
    productCode: 'D047',
    productName: '자동차용경유',
    price: 1998.65,
    source: 'opinet-monthly-average-price',
    fetchedAt: '2026-07-14T00:00:00.000Z',
  },
];

test('refreshOpinetSeriesCache reuses provided daily rows and refreshes weekly/monthly caches', async () => {
  let dailyFetchCalled = 0;
  let weeklyFetchCalled = 0;
  let monthlyFetchCalled = 0;

  const summary = await refreshOpinetSeriesCache({
    dailyEntries,
    deps: {
      fetchDaily: async () => {
        dailyFetchCalled += 1;
        return dailyEntries;
      },
      fetchWeekly: async () => {
        weeklyFetchCalled += 1;
        return weeklyEntries;
      },
      fetchMonthly: async () => {
        monthlyFetchCalled += 1;
        return monthlyEntries;
      },
      saveDaily: async (entries) => entries,
      saveWeekly: async (entries) => entries,
      saveMonthly: async (entries) => entries,
    },
  });

  assert.equal(dailyFetchCalled, 0);
  assert.equal(weeklyFetchCalled, 1);
  assert.equal(monthlyFetchCalled, 1);
  assert.deepEqual(summary, {
    daily: { fetchedCount: 1, savedCount: 1 },
    weekly: { fetchedCount: 1, savedCount: 1 },
    monthly: { fetchedCount: 1, savedCount: 1 },
  });
});

test('refreshOpinetSeriesCache fetches daily rows when not supplied', async () => {
  let dailyFetchCalled = 0;

  const summary = await refreshOpinetSeriesCache({
    deps: {
      fetchDaily: async () => {
        dailyFetchCalled += 1;
        return dailyEntries;
      },
      fetchWeekly: async () => weeklyEntries,
      fetchMonthly: async () => monthlyEntries,
      saveDaily: async (entries) => entries,
      saveWeekly: async (entries) => entries,
      saveMonthly: async (entries) => entries,
    },
  });

  assert.equal(dailyFetchCalled, 1);
  assert.equal(summary.daily.fetchedCount, 1);
  assert.equal(summary.weekly.savedCount, 1);
  assert.equal(summary.monthly.savedCount, 1);
});
