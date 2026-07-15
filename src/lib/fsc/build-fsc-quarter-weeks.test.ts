import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import { buildFscQuarterWeeks, type BuildFscQuarterWeeksInput } from './build-fsc-quarter-weeks';
import type { FscSourceDailyPriceRow } from './types';
function createDailyRow(date: string, price: number): FscSourceDailyPriceRow {
  return {
    priceDate: new Date(`${date}T00:00:00.000Z`),
    currentRevisionId: `rev-${date}`,
    observedPriceKrwPerL: new Prisma.Decimal(price),
  };
}

function createInput(dailyPrices: readonly FscSourceDailyPriceRow[]): BuildFscQuarterWeeksInput {
  return {
    quarterSetting: {
      targetYear: 2026,
      targetQuarter: 3,
      referenceYear: 2026,
      referenceQuarter: 2,
      quarterStartDate: new Date('2026-07-01T00:00:00.000Z'),
      quarterEndDate: new Date('2026-09-30T00:00:00.000Z'),
      basePriceKrwPerL: new Prisma.Decimal('1500'),
      appliedPriceKrwPerL: new Prisma.Decimal('1500'),
    },
    currentTruthCutoffAt: new Date('2026-07-15T22:56:14.642Z'),
    dailyPrices,
    officialWeeklyPrices: [],
    officialMonthlyPrices: [],
    forecastRun: null,
  };
}

test('completed 5-day week becomes actual when daily rows exist through week end even if cutoff timestamp is earlier the same day', () => {
  const result = buildFscQuarterWeeks(
    createInput([
      createDailyRow('2026-07-01', 1923.52),
      createDailyRow('2026-07-02', 1910.28),
      createDailyRow('2026-07-05', 1890.56),
      createDailyRow('2026-07-06', 1884.59),
      createDailyRow('2026-07-07', 1879.13),
      createDailyRow('2026-07-08', 1874.65),
      createDailyRow('2026-07-09', 1871.75),
      createDailyRow('2026-07-12', 1865.99),
      createDailyRow('2026-07-13', 1863.93),
      createDailyRow('2026-07-14', 1861.97),
      createDailyRow('2026-07-15', 1860.70),
      createDailyRow('2026-07-16', 1860.16),
    ]),
  );

  assert.equal(result.weeks[2]?.priceKind, 'actual');
  assert.equal(result.weeks[2]?.forecastSourceKind, null);
  assert.equal(result.weeks[2]?.actualPriceKrwPerL?.toFixed(3), '1862.550');
});

test('incomplete current week still falls back when final collection day row is missing', () => {
  const result = buildFscQuarterWeeks(
    createInput([
      createDailyRow('2026-07-01', 1923.52),
      createDailyRow('2026-07-02', 1910.28),
      createDailyRow('2026-07-05', 1890.56),
      createDailyRow('2026-07-06', 1884.59),
      createDailyRow('2026-07-07', 1879.13),
      createDailyRow('2026-07-08', 1874.65),
      createDailyRow('2026-07-09', 1871.75),
      createDailyRow('2026-07-12', 1865.99),
      createDailyRow('2026-07-13', 1863.93),
      createDailyRow('2026-07-14', 1861.97),
      createDailyRow('2026-07-15', 1860.70),
    ]),
  );

  assert.equal(result.weeks[2]?.priceKind, 'forecast');
  assert.equal(result.weeks[2]?.forecastSourceKind, 'applied_price_fallback');
  assert.equal(result.weeks[2]?.priceKrwPerL.toFixed(3), '1500.000');
});
