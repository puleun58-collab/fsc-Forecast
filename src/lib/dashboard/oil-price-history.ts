import { readMonthlySeries } from '@/lib/opinet/save-monthly-series';
import { readQuarterlySeries } from '@/lib/opinet/save-quarterly-series';

import type {
  OilPriceHistoryMonth,
  OilPriceHistoryQuarter,
  OilPriceHistoryQuarterNumber,
  OilPriceHistorySection,
  OilPriceHistoryYear,
} from './fsc-types';
import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselQuarterlyPriceRow,
} from '@/lib/opinet/types';

const ACTUAL_MONTHLY_SOURCE = 'opinet-monthly-average-price';
const ACTUAL_QUARTERLY_SOURCE = 'opinet-quarterly-average-price';
const SEOUL_UTC_OFFSET_MS = 9 * 60 * 60 * 1_000;

function getQuarter(month: number): OilPriceHistoryQuarterNumber {
  if (month <= 3) {
    return 1;
  }
  if (month <= 6) {
    return 2;
  }
  if (month <= 9) {
    return 3;
  }
  return 4;
}

function toSeoulDateOnly(value: Date): Date {
  const seoulTime = new Date(value.getTime() + SEOUL_UTC_OFFSET_MS);
  return new Date(Date.UTC(seoulTime.getUTCFullYear(), seoulTime.getUTCMonth(), seoulTime.getUTCDate()));
}

function toCompletedActualMonth(
  row: NormalizedDieselMonthlyPriceRow,
  today: Date,
): OilPriceHistoryMonth | null {
  if (row.source !== ACTUAL_MONTHLY_SOURCE) {
    return null;
  }

  const monthKey = /^(\d{4})(\d{2})$/.exec(row.monthKey);
  const dataBasisDate = new Date(`${row.monthEndDate}T00:00:00.000Z`);
  if (monthKey === null || Number.isNaN(dataBasisDate.getTime()) || dataBasisDate.getTime() >= today.getTime()) {
    return null;
  }

  const year = Number(monthKey[1]);
  const month = Number(monthKey[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  return {
    year,
    month,
    quarter: getQuarter(month),
    averagePriceKrwPerL: row.price,
    dataBasisDate: row.monthEndDate,
  };
}

function buildYear(
  year: number,
  months: readonly OilPriceHistoryMonth[],
  quarterlyRows: readonly NormalizedDieselQuarterlyPriceRow[],
): OilPriceHistoryYear {
  const quarters: OilPriceHistoryQuarter[] = [];

  for (const quarterNumber of [1, 2, 3, 4] as const) {
    const quarterMonths = months.filter((month) => month.quarter === quarterNumber);
    if (quarterMonths.length === 0) {
      continue;
    }

    const officialQuarter = quarterlyRows.find((row) => (
      row.source === ACTUAL_QUARTERLY_SOURCE
      && row.quarterKey === `${year}Q${quarterNumber}`
    ));
    const averagePriceKrwPerL = quarterMonths.length === 3 && officialQuarter
      ? officialQuarter.price
      : null;
    const previousQuarter = quarters[quarters.length - 1];
    const previousAverage = previousQuarter?.quarter === quarterNumber - 1
      ? previousQuarter.averagePriceKrwPerL
      : null;
    const changeFromPreviousQuarter = averagePriceKrwPerL !== null
      && previousAverage !== null
      && previousAverage !== 0
      ? {
          amountKrwPerL: averagePriceKrwPerL - previousAverage,
          percent: ((averagePriceKrwPerL - previousAverage) / previousAverage) * 100,
        }
      : null;

    quarters.push({
      year,
      quarter: quarterNumber,
      months: quarterMonths,
      averagePriceKrwPerL,
      changeFromPreviousQuarter,
    });
  }

  return {
    year,
    quarters,
    latestDataBasisDate: months[months.length - 1]?.dataBasisDate ?? '',
  };
}

export function buildOilPriceHistory(
  rows: readonly NormalizedDieselMonthlyPriceRow[],
  now: Date = new Date(),
  quarterlyRows: readonly NormalizedDieselQuarterlyPriceRow[] = [],
): OilPriceHistorySection {
  const today = toSeoulDateOnly(now);
  const months = rows
    .map((row) => toCompletedActualMonth(row, today))
    .filter((month): month is OilPriceHistoryMonth => month !== null)
    .sort((left, right) => left.dataBasisDate.localeCompare(right.dataBasisDate));
  const currentYear = today.getUTCFullYear();
  const dataYears = Array.from(new Set(months.map((month) => month.year))).sort((left, right) => right - left);
  const availableYears = dataYears.includes(currentYear) ? dataYears : [currentYear, ...dataYears];

  return {
    defaultYear: currentYear,
    availableYears,
    years: dataYears.map((year) => buildYear(
      year,
      months.filter((month) => month.year === year),
      quarterlyRows,
    )),
  };
}

export async function loadOilPriceHistory(now: Date = new Date()): Promise<OilPriceHistorySection> {
  const [monthlyRows, quarterlyRows] = await Promise.all([
    readMonthlySeries(),
    readQuarterlySeries(),
  ]);
  return buildOilPriceHistory(monthlyRows, now, quarterlyRows);
}
