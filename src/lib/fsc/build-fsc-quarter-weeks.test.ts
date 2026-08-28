import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import { buildFscQuarterWeeks, type BuildFscQuarterWeeksInput } from './build-fsc-quarter-weeks';
import type { FscSourceDailyPriceRow, FscSourceOfficialWeeklyPriceRow } from './types';
import { calculateFscResult } from './calculate-fsc-result';

function createMonthlyForecastRun() {
  return {
    id: 'forecast-run-monthly',
    forecastModelVersion: null,
    mapePct: null,
    maeKrwPerL: null,
    metadata: null,
    createdAt: new Date('2026-07-15T22:56:16.053Z'),
    completedAt: new Date('2026-07-15T22:56:16.053Z'),
    points: [
      ['2026-07-31', '1971.590'],
      ['2026-08-31', '1968.420'],
      ['2026-09-30', '1965.310'],
    ].map(([targetDate, price], index) => ({
      id: `monthly-point-${targetDate}`,
      horizonKind: 'monthly' as const,
      horizonIndex: index + 1,
      targetDate: new Date(`${targetDate}T00:00:00.000Z`),
      pointKrwPerL: new Prisma.Decimal(price),
    })),
  };
}

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
    forecastRun: createMonthlyForecastRun(),
  };
}

function createWeeklyForecastRun(targetDate: string, price: string) {
  return {
    id: 'forecast-run-1',
    forecastModelVersion: null,
    mapePct: null,
    maeKrwPerL: null,
    metadata: null,
    createdAt: new Date('2026-07-15T22:56:16.053Z'),
    completedAt: new Date('2026-07-15T22:56:16.053Z'),
    points: [
      {
        id: `point-${targetDate}`,
        horizonKind: 'weekly' as const,
        horizonIndex: 1,
        targetDate: new Date(`${targetDate}T00:00:00.000Z`),
        pointKrwPerL: new Prisma.Decimal(price),
      },
    ],
  };
}
function createForecastRun(
  weeklyPoints: ReadonlyArray<readonly [targetDate: string, price: string]>,
  monthlyPoints: ReadonlyArray<readonly [targetDate: string, price: string]> = [],
) {
  return {
    id: 'forecast-run-custom',
    forecastModelVersion: 'weekly-test-model',
    mapePct: null,
    maeKrwPerL: null,
    metadata: null,
    createdAt: new Date('2026-07-15T22:56:16.053Z'),
    completedAt: new Date('2026-07-15T22:56:16.053Z'),
    points: [
      ...weeklyPoints.map(([targetDate, price], index) => ({
        id: `weekly-point-${targetDate}`,
        horizonKind: 'weekly' as const,
        horizonIndex: index + 1,
        targetDate: new Date(`${targetDate}T00:00:00.000Z`),
        pointKrwPerL: new Prisma.Decimal(price),
      })),
      ...monthlyPoints.map(([targetDate, price], index) => ({
        id: `monthly-point-${targetDate}`,
        horizonKind: 'monthly' as const,
        horizonIndex: index + 1,
        targetDate: new Date(`${targetDate}T00:00:00.000Z`),
        pointKrwPerL: new Prisma.Decimal(price),
      })),
    ],
  };
}

function createOfficialWeeklyRow(
  weekKey: string,
  weekStartDate: string,
  weekEndDate: string,
  price: string,
): FscSourceOfficialWeeklyPriceRow {
  return {
    weekKey,
    weekLabel: `${weekKey}주`,
    weekStartDate: new Date(`${weekStartDate}T00:00:00.000Z`),
    weekEndDate: new Date(`${weekEndDate}T00:00:00.000Z`),
    priceKrwPerL: new Prisma.Decimal(price),
    fetchedAt: new Date('2026-07-24T01:23:22.732Z'),
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

test('published Opinet weekly value overrides the recomputed daily average exactly', () => {
  const input = createInput([
    createDailyRow('2026-07-19', 1862.19),
    createDailyRow('2026-07-20', 1859.26),
    createDailyRow('2026-07-21', 1856.76),
    createDailyRow('2026-07-22', 1854.21),
    createDailyRow('2026-07-23', 1852.06),
  ]);
  input.officialWeeklyPrices = [
    createOfficialWeeklyRow('2026074', '2026-07-19', '2026-07-23', '1856.89'),
  ];

  const result = buildFscQuarterWeeks(input);
  const fourthWeek = result.weeks.find((week) => week.sequenceNo === 4);
  const payload = result.calculationPayload as {
    actualSourceBreakdown: { officialWeekly: number; dailyAverage: number };
  };

  assert.equal(fourthWeek?.priceKind, 'actual');
  assert.equal(fourthWeek?.actualPriceKrwPerL?.toFixed(3), '1856.890');
  assert.equal(payload.actualSourceBreakdown.officialWeekly, 1);
  assert.equal(payload.actualSourceBreakdown.dailyAverage, 0);
});

test('missing weekly forecast coverage produces pending rows instead of configured price substitutes', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1923.52),
    createDailyRow('2026-07-02', 1910.28),
  ]);
  input.forecastRun = null;

  const result = buildFscQuarterWeeks(input);
  const pendingWeek = result.weeks[1];

  assert.equal(pendingWeek?.priceKind, 'forecast');
  assert.equal(pendingWeek?.priceKrwPerL, null);
  assert.equal(pendingWeek?.forecastPriceKrwPerL, null);
  assert.equal(pendingWeek?.forecastSourceKind, null);
  assert.equal(pendingWeek?.priceDiffKrwPerL, null);
  assert.equal(pendingWeek?.diffRatio, null);
  assert.equal(result.quarterAverageKrwPerL.toFixed(3), '1916.900');
});

test('incomplete current week uses weekly forecast point instead of applied price fallback when 5-day actual is not complete', () => {
  const input = createInput([
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
  ]);

  input.forecastRun = createWeeklyForecastRun('2026-07-16', '1971.590');

  const result = buildFscQuarterWeeks(input);

  assert.equal(result.weeks[2]?.priceKind, 'forecast');
  assert.equal(result.weeks[2]?.forecastSourceKind, 'weekly_point');
  assert.equal(result.weeks[2]?.priceKrwPerL?.toFixed(3), '1971.590');
  assert.equal(result.weeks[2]?.fallbackUsed, false);
});

test('quarter calculation keeps the previous completed weekly value for the first row comparison', () => {
  const input = createInput([]);
  input.officialWeeklyPrices = [
    createOfficialWeeklyRow('2026064', '2026-06-21', '2026-06-25', '2001.30'),
  ];

  input.forecastRun = createForecastRun([
    ['2026-07-02', '1990.000'],
    ['2026-07-09', '1980.000'],
  ]);
  const result = buildFscQuarterWeeks(input);
  const payload = result.calculationPayload as {
    previousWeekBasis: {
      weekStartDate: string;
      weekEndDate: string;
      priceKrwPerL: string;
      sourceKind: string;
    } | null;
  };

  assert.deepEqual(payload.previousWeekBasis, {
    weekStartDate: '2026-06-21',
    weekEndDate: '2026-06-25',
    priceKrwPerL: '2001.300',
    sourceKind: 'official_weekly',
  });
});

test('monthly forecast is ignored when a weekly point is missing', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [
      ['2026-07-09', '1840.000'],
      ['2026-07-16', '1825.000'],
    ],
    [['2026-07-31', '1818.380']],
  );

  const result = buildFscQuarterWeeks(input);
  const missingWeek = result.weeks.find((week) => week.weekEndDate.toISOString().startsWith('2026-07-23'));

  assert.equal(missingWeek?.forecastSourceKind, 'weekly_trend_extension');
  assert.equal(missingWeek?.priceKrwPerL?.toFixed(3), '1810.000');
  assert.notEqual(missingWeek?.priceKrwPerL?.toFixed(3), '1818.380');
});

test('applied price is never used as a weekly forecast substitute', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  input.quarterSetting.appliedPriceKrwPerL = new Prisma.Decimal('1777.000');
  input.forecastRun = createForecastRun([
    ['2026-07-09', '1840.000'],
    ['2026-07-16', '1825.000'],
  ]);

  const result = buildFscQuarterWeeks(input);
  const forecastPrices = result.weeks.flatMap((week) =>
    week.forecastPriceKrwPerL === null ? [] : [week.forecastPriceKrwPerL.toFixed(3)],
  );

  assert.equal(forecastPrices.includes('1777.000'), false);
  assert.equal(result.weeks.some((week) => week.forecastSourceKind === 'weekly_trend_extension'), true);
});

test('base price is never used as a weekly forecast substitute', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  input.quarterSetting.basePriceKrwPerL = new Prisma.Decimal('1666.000');
  input.forecastRun = createForecastRun([
    ['2026-07-09', '1840.000'],
    ['2026-07-16', '1825.000'],
  ]);

  const result = buildFscQuarterWeeks(input);
  const forecastPrices = result.weeks.flatMap((week) =>
    week.forecastPriceKrwPerL === null ? [] : [week.forecastPriceKrwPerL.toFixed(3)],
  );

  assert.equal(forecastPrices.includes('1666.000'), false);
  assert.equal(result.weeks.every((week) => week.fallbackUsed === false), true);
});

test('missing weekly point extends the arithmetic mean of prior weekly changes', () => {
  const input = createInput([]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-30T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [
      ['2026-07-02', '1840.050'],
      ['2026-07-09', '1825.170'],
      ['2026-07-16', '1810.300'],
      ['2026-07-23', '1795.420'],
    ],
    [['2026-07-31', '1818.380']],
  );

  const result = buildFscQuarterWeeks(input);
  const extension = result.weeks.find((week) => week.weekEndDate.toISOString().startsWith('2026-07-30'));

  assert.equal(extension?.forecastSourceKind, 'weekly_trend_extension');
  assert.equal(extension?.priceKrwPerL?.toFixed(3), '1780.543');
  assert.equal(extension?.forecastPointId, null);
  assert.equal(extension?.sourcePriceDate?.toISOString().slice(0, 10), '2026-07-23');
});

test('insufficient weekly history leaves the forecast pending without an arbitrary price', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-16T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [['2026-07-09', '1840.000']],
    [['2026-07-31', '1818.380']],
  );

  const result = buildFscQuarterWeeks(input);
  const pendingWeek = result.weeks.find((week) => week.weekEndDate.toISOString().startsWith('2026-07-16'));
  const payload = result.calculationPayload as { pendingForecastWeekCount: number };

  assert.equal(pendingWeek?.priceKrwPerL, null);
  assert.equal(pendingWeek?.forecastSourceKind, null);
  assert.equal(payload.pendingForecastWeekCount, 1);
});

test('month-boundary week uses weekly trend extension rather than either monthly forecast', () => {
  const input = createInput([]);
  input.quarterSetting.quarterStartDate = new Date('2026-09-06T00:00:00.000Z');
  input.quarterSetting.quarterEndDate = new Date('2026-10-08T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [
      ['2026-09-10', '1800.000'],
      ['2026-09-17', '1790.000'],
      ['2026-09-24', '1780.000'],
    ],
    [
      ['2026-09-30', '1818.380'],
      ['2026-10-31', '1830.000'],
    ],
  );

  const result = buildFscQuarterWeeks(input);
  const boundaryWeek = result.weeks.find(
    (week) =>
      week.weekStartDate.toISOString().startsWith('2026-09-27') &&
      week.weekEndDate.toISOString().startsWith('2026-10-01'),
  );

  assert.equal(boundaryWeek?.forecastSourceKind, 'weekly_trend_extension');
  assert.equal(boundaryWeek?.priceKrwPerL?.toFixed(3), '1770.000');
});

test('one monthly value cannot repeat across multiple missing weekly slots', () => {
  const input = createInput([]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-30T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [
      ['2026-07-02', '1850.000'],
      ['2026-07-09', '1840.000'],
    ],
    [['2026-07-31', '1818.380']],
  );

  const result = buildFscQuarterWeeks(input);
  const extensions = result.weeks.filter((week) => week.forecastSourceKind === 'weekly_trend_extension');
  const extensionPrices = extensions.map((week) => week.priceKrwPerL?.toFixed(3));

  assert.deepEqual(extensionPrices, ['1830.000', '1820.000', '1810.000']);
  assert.equal(extensionPrices.includes('1818.380'), false);
});

test('monthly forecast cannot reverse a continuing weekly decline', () => {
  const input = createInput([]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [
      ['2026-07-02', '1840.000'],
      ['2026-07-09', '1825.000'],
      ['2026-07-16', '1810.000'],
    ],
    [['2026-07-31', '1900.000']],
  );

  const result = buildFscQuarterWeeks(input);
  const weeklyPrices = result.weeks.flatMap((week) =>
    week.priceKrwPerL === null ? [] : [week.priceKrwPerL.toNumber()],
  );

  assert.deepEqual(weeklyPrices, [1840, 1825, 1810, 1795]);
  assert.equal(result.weeks[3]?.forecastSourceKind, 'weekly_trend_extension');
});

test('new actual data replaces its week and the new forecast run recalculates remaining weeks', () => {
  const initialInput = createInput([
    createDailyRow('2026-07-01', 1910),
    createDailyRow('2026-07-02', 1910),
  ]);
  initialInput.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  initialInput.forecastRun = createForecastRun([
    ['2026-07-09', '1890.000'],
    ['2026-07-16', '1880.000'],
  ]);
  const initial = buildFscQuarterWeeks(initialInput);

  const refreshedInput = createInput([
    createDailyRow('2026-07-01', 1910),
    createDailyRow('2026-07-02', 1910),
    createDailyRow('2026-07-05', 1875),
    createDailyRow('2026-07-06', 1875),
    createDailyRow('2026-07-07', 1875),
    createDailyRow('2026-07-08', 1875),
    createDailyRow('2026-07-09', 1875),
  ]);
  refreshedInput.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  refreshedInput.forecastRun = createForecastRun([
    ['2026-07-16', '1860.000'],
    ['2026-07-23', '1850.000'],
  ]);
  const refreshed = buildFscQuarterWeeks(refreshedInput);

  assert.equal(initial.weeks[1]?.priceKind, 'forecast');
  assert.equal(initial.weeks[2]?.priceKrwPerL?.toFixed(3), '1880.000');
  assert.equal(refreshed.weeks[1]?.priceKind, 'actual');
  assert.equal(refreshed.weeks[1]?.priceKrwPerL?.toFixed(3), '1875.000');
  assert.equal(refreshed.weeks[2]?.priceKrwPerL?.toFixed(3), '1860.000');
});

test('quarter average and FSC calculation include only valid actual and weekly forecast prices', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  input.forecastRun = createForecastRun(
    [['2026-07-09', '1800.000']],
    [['2026-07-31', '2500.000']],
  );

  const result = buildFscQuarterWeeks(input);
  const calculation = calculateFscResult({
    basePriceKrwPerL: input.quarterSetting.basePriceKrwPerL,
    appliedPriceKrwPerL: input.quarterSetting.appliedPriceKrwPerL,
    quarterAverageKrwPerL: result.quarterAverageKrwPerL,
    fscLowRate: '0.3000',
    fscHighRate: '0.7000',
  });

  assert.equal(result.actualWeekCount, 1);
  assert.equal(result.forecastWeekCount, 1);
  assert.equal(result.quarterAverageKrwPerL.toFixed(3), '1850.000');
  assert.equal(calculation.quarterAverageKrwPerL.toFixed(3), '1850.000');
  assert.equal(calculation.fscLowKrwPerL.toFixed(3), '1979.500');
  assert.equal(calculation.fscHighKrwPerL.toFixed(3), '2152.166');
});
