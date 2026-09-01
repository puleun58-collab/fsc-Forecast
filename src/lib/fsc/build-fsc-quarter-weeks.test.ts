import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import { buildFscQuarterWeeks, type BuildFscQuarterWeeksInput } from './build-fsc-quarter-weeks';
import type { FscSourceDailyPriceRow, FscSourceOfficialWeeklyPriceRow } from './types';
import { calculateFscResult } from './calculate-fsc-result';
import { calculateEstimatedFscRate } from './estimated-fsc-rate';

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
      lowerBoundKrwPerL: null,
      upperBoundKrwPerL: null,
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
    officialQuarterlyPrices: [],
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
        lowerBoundKrwPerL: new Prisma.Decimal(price).minus(20),
        upperBoundKrwPerL: new Prisma.Decimal(price).plus(20),
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
        lowerBoundKrwPerL: new Prisma.Decimal(price).minus(15),
        upperBoundKrwPerL: new Prisma.Decimal(price).plus(15),
      })),
      ...monthlyPoints.map(([targetDate, price], index) => ({
        id: `monthly-point-${targetDate}`,
        horizonKind: 'monthly' as const,
        horizonIndex: index + 1,
        targetDate: new Date(`${targetDate}T00:00:00.000Z`),
        pointKrwPerL: new Prisma.Decimal(price),
        lowerBoundKrwPerL: null,
        upperBoundKrwPerL: null,
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
    oilWeightRate: '0.3000',
  });

  assert.equal(result.actualWeekCount, 1);
  assert.equal(result.forecastWeekCount, 1);
  assert.equal(result.quarterAverageKrwPerL.toFixed(3), '1850.000');
  assert.equal(calculation.quarterAverageKrwPerL.toFixed(3), '1850.000');
  assert.equal(
    calculateEstimatedFscRate({
      diffRatio: calculation.diffRatio.toFixed(6),
      oilWeightRate: calculation.oilWeightRate.toFixed(4),
    }),
    '0.070000',
  );
});

test('weekly forecast weeks carry the backtest-derived expected range', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-23T00:00:00.000Z');
  input.forecastRun = createForecastRun([
    ['2026-07-09', '1840.000'],
    ['2026-07-16', '1825.000'],
  ]);

  const result = buildFscQuarterWeeks(input);
  const weeklyPointWeek = result.weeks.find((week) => week.forecastSourceKind === 'weekly_point');
  const trendExtensionWeek = result.weeks.find(
    (week) => week.forecastSourceKind === 'weekly_trend_extension',
  );
  const actualWeek = result.weeks.find((week) => week.priceKind === 'actual');

  assert.equal(weeklyPointWeek?.forecastLowerBoundKrwPerL?.toFixed(3), '1825.000');
  assert.equal(weeklyPointWeek?.forecastUpperBoundKrwPerL?.toFixed(3), '1855.000');
  assert.equal(trendExtensionWeek?.forecastLowerBoundKrwPerL, null);
  assert.equal(trendExtensionWeek?.forecastUpperBoundKrwPerL, null);
  assert.equal(actualWeek?.forecastLowerBoundKrwPerL, null);
  assert.equal(actualWeek?.forecastUpperBoundKrwPerL, null);
});

function createCompletedQuarterInput(): BuildFscQuarterWeeksInput {
  const dailyPrices: FscSourceDailyPriceRow[] = [];

  for (let day = new Date('2026-04-01T00:00:00.000Z'); day.getTime() <= Date.UTC(2026, 5, 30); day.setUTCDate(day.getUTCDate() + 1)) {
    dailyPrices.push(createDailyRow(day.toISOString().slice(0, 10), 1900));
  }

  const input = createInput(dailyPrices);
  input.quarterSetting.targetQuarter = 2;
  input.quarterSetting.referenceQuarter = 1;
  input.quarterSetting.quarterStartDate = new Date('2026-04-01T00:00:00.000Z');
  input.quarterSetting.quarterEndDate = new Date('2026-06-30T00:00:00.000Z');
  input.currentTruthCutoffAt = new Date('2026-08-31T05:16:07.374Z');
  input.forecastRun = null;
  return input;
}

function createOfficialMonth(monthKey: string, monthLabel: string, price: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(4, 6));

  return {
    monthKey,
    monthLabel,
    monthStartDate: new Date(Date.UTC(year, month - 1, 1)),
    monthEndDate: new Date(Date.UTC(year, month, 0)),
    priceKrwPerL: new Prisma.Decimal(price),
    fetchedAt: new Date('2026-08-31T00:00:00.000Z'),
  };
}

test('completed quarter uses the official Opinet quarterly average instead of the weekly average', () => {
  const input = createCompletedQuarterInput();
  input.officialQuarterlyPrices = [
    {
      quarterKey: '2026Q2',
      quarterLabel: '2026년2분기',
      quarterStartDate: new Date('2026-04-01T00:00:00.000Z'),
      quarterEndDate: new Date('2026-06-30T00:00:00.000Z'),
      priceKrwPerL: new Prisma.Decimal('1994.65'),
      fetchedAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  ];

  const result = buildFscQuarterWeeks(input);
  const calculation = calculateFscResult({
    basePriceKrwPerL: input.quarterSetting.basePriceKrwPerL,
    appliedPriceKrwPerL: input.quarterSetting.appliedPriceKrwPerL,
    quarterAverageKrwPerL: result.quarterAverageKrwPerL,
    oilWeightRate: '0.3000',
  });

  assert.equal(result.quarterAverageKrwPerL.toFixed(3), '1994.650');
  assert.equal(result.quarterAverageBasis.kind, 'official_quarterly');
  assert.equal(result.quarterAverageBasis.weeklyAverageKrwPerL?.toFixed(3), '1900.000');
  assert.equal(calculation.diffRatio.toFixed(6), '0.329767');
});

test('completed quarter without an official quarterly average falls back to the three official monthly averages', () => {
  const input = createCompletedQuarterInput();
  input.officialMonthlyPrices = [
    createOfficialMonth('202604', '2026년04월', '1979.31'),
    createOfficialMonth('202605', '2026년05월', '2005.71'),
    createOfficialMonth('202606', '2026년06월', '1998.65'),
  ];

  const result = buildFscQuarterWeeks(input);

  assert.equal(result.quarterAverageBasis.kind, 'official_monthly_average');
  assert.equal(result.quarterAverageKrwPerL.toFixed(3), '1994.557');
});

test('completed quarter without official Opinet averages never substitutes the weekly average', () => {
  const input = createCompletedQuarterInput();
  input.officialMonthlyPrices = [createOfficialMonth('202604', '2026년04월', '1979.31')];

  assert.throws(() => buildFscQuarterWeeks(input), /Official Opinet quarterly average is unavailable/);
});

test('active quarter keeps the weekly actual and forecast average even when an official quarterly average exists', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-16T00:00:00.000Z');
  input.forecastRun = createForecastRun([['2026-07-09', '1840.000'], ['2026-07-16', '1820.000']]);
  input.officialQuarterlyPrices = [
    {
      quarterKey: '2026Q3',
      quarterLabel: '2026년3분기',
      quarterStartDate: new Date('2026-07-01T00:00:00.000Z'),
      quarterEndDate: new Date('2026-09-30T00:00:00.000Z'),
      priceKrwPerL: new Prisma.Decimal('1700.00'),
      fetchedAt: new Date('2026-07-15T00:00:00.000Z'),
    },
  ];

  const result = buildFscQuarterWeeks(input);

  assert.equal(result.quarterAverageBasis.kind, 'weekly_actual_forecast');
  assert.equal(result.quarterAverageKrwPerL.toFixed(3), '1853.333');
});

function createOfficialWeek(
  weekKey: string,
  weekLabel: string,
  weekStartDate: string,
  weekEndDate: string,
  price: string,
): FscSourceOfficialWeeklyPriceRow {
  return {
    weekKey,
    weekLabel,
    weekStartDate: new Date(`${weekStartDate}T00:00:00.000Z`),
    weekEndDate: new Date(`${weekEndDate}T00:00:00.000Z`),
    priceKrwPerL: new Prisma.Decimal(price),
    fetchedAt: new Date('2026-08-31T00:00:00.000Z'),
  };
}

const OFFICIAL_Q2_WEEKS: FscSourceOfficialWeeklyPriceRow[] = [
  createOfficialWeek('2026035', '2026년03월5주', '2026-03-22', '2026-03-26', '1827.96'),
  createOfficialWeek('2026041', '2026년04월1주', '2026-03-29', '2026-04-02', '1886.36'),
  createOfficialWeek('2026042', '2026년04월2주', '2026-04-05', '2026-04-09', '1959.12'),
  createOfficialWeek('2026071', '2026년07월1주', '2026-06-28', '2026-07-02', '1942.39'),
];

test('completed quarter weeks mirror the official Opinet weekly rows without clipping', () => {
  const input = createCompletedQuarterInput();
  input.officialWeeklyPrices = OFFICIAL_Q2_WEEKS;
  input.officialQuarterlyPrices = [
    {
      quarterKey: '2026Q2',
      quarterLabel: '2026년2분기',
      quarterStartDate: new Date('2026-04-01T00:00:00.000Z'),
      quarterEndDate: new Date('2026-06-30T00:00:00.000Z'),
      priceKrwPerL: new Prisma.Decimal('1994.65'),
      fetchedAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  ];

  const result = buildFscQuarterWeeks(input);
  const payload = result.calculationPayload as {
    previousWeekBasis: { priceKrwPerL: string; sourceKind: string } | null;
  };

  assert.deepEqual(
    result.weeks.map((week) => [
      week.officialWeekLabel,
      week.weekStartDate.toISOString().slice(0, 10),
      week.weekEndDate.toISOString().slice(0, 10),
      week.priceKrwPerL?.toFixed(2),
      week.priceKind,
    ]),
    [
      ['2026년04월1주', '2026-03-29', '2026-04-02', '1886.36', 'actual'],
      ['2026년04월2주', '2026-04-05', '2026-04-09', '1959.12', 'actual'],
    ],
  );
  assert.equal(result.actualWeekCount, 2);
  assert.equal(result.forecastWeekCount, 0);
  assert.equal(payload.previousWeekBasis?.priceKrwPerL, '1827.960');
  assert.equal(payload.previousWeekBasis?.sourceKind, 'official_weekly');
});

test('completed quarter weeks exclude official weeks from other quarters', () => {
  const input = createCompletedQuarterInput();
  input.officialWeeklyPrices = OFFICIAL_Q2_WEEKS;
  input.officialQuarterlyPrices = [
    {
      quarterKey: '2026Q2',
      quarterLabel: '2026년2분기',
      quarterStartDate: new Date('2026-04-01T00:00:00.000Z'),
      quarterEndDate: new Date('2026-06-30T00:00:00.000Z'),
      priceKrwPerL: new Prisma.Decimal('1994.65'),
      fetchedAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  ];

  const labels = buildFscQuarterWeeks(input).weeks.map((week) => week.officialWeekLabel);

  assert.ok(!labels.includes('2026년07월1주'));
  assert.ok(!labels.includes('2026년03월5주'));
});

test('active quarter weeks keep quarter-clipped slots and daily or forecast sources', () => {
  const input = createInput([
    createDailyRow('2026-07-01', 1900),
    createDailyRow('2026-07-02', 1900),
  ]);
  input.quarterSetting.quarterEndDate = new Date('2026-07-16T00:00:00.000Z');
  input.forecastRun = createForecastRun([['2026-07-09', '1840.000'], ['2026-07-16', '1820.000']]);

  const result = buildFscQuarterWeeks(input);

  assert.equal(result.weeks[0]?.weekStartDate.toISOString().slice(0, 10), '2026-07-01');
  assert.equal(result.weeks[0]?.officialWeekLabel, null);
  assert.equal(result.forecastWeekCount, 2);
});
