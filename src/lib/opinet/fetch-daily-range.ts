import { DIESEL_PRODUCT_CODE, DIESEL_PRODUCT_NAME } from './normalize-diesel';
import { fetchOpinetStatsCsv, type DailyStatsRange } from './fetch-stats-csv';

import type { NormalizedDieselPriceRow } from './types';

export const OPINET_STATS_DAILY_PRICE_SOURCE = 'opinet-stats-daily';

export interface FetchOpinetDieselDailyRangeInput {
  readonly from: string;
  readonly to: string;
  readonly now?: Date;
}

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const KOREAN_LABEL_PATTERN = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/;

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRealCalendarDate(candidate: CalendarDate): boolean {
  if (candidate.month < 1 || candidate.month > 12 || candidate.day < 1) {
    return false;
  }

  return candidate.day <= getLastDayOfMonth(candidate.year, candidate.month);
}

function toDateKey(candidate: CalendarDate): string {
  return `${candidate.year}${String(candidate.month).padStart(2, '0')}${String(candidate.day).padStart(2, '0')}`;
}

function parseIsoDate(value: string, fieldName: string): CalendarDate {
  const match = ISO_DATE_PATTERN.exec(value.trim());

  if (!match) {
    throw new Error(`Opinet daily range ${fieldName} must be YYYY-MM-DD, received '${value}'.`);
  }

  const candidate: CalendarDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };

  if (!isRealCalendarDate(candidate)) {
    throw new Error(`Opinet daily range ${fieldName} is not a real calendar date: '${value}'.`);
  }

  return candidate;
}

export function parseDailyStatsLabel(label: string): CalendarDate {
  const normalized = label.trim();
  const koreanMatch = KOREAN_LABEL_PATTERN.exec(normalized);
  const isoMatch = koreanMatch ? null : ISO_DATE_PATTERN.exec(normalized);
  const match = koreanMatch ?? isoMatch;

  if (!match) {
    throw new Error(
      `Unexpected Opinet daily stats label: '${label}'. Expected 'YYYY년MM월DD일' or 'YYYY-MM-DD'.`,
    );
  }

  const candidate: CalendarDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };

  if (!isRealCalendarDate(candidate)) {
    throw new Error(`Opinet daily stats label is not a real calendar date: '${label}'.`);
  }

  return candidate;
}

function createMonthChunks(from: CalendarDate, to: CalendarDate): DailyStatsRange[] {
  const chunks: DailyStatsRange[] = [];
  let year = from.year;
  let month = from.month;

  while (year * 12 + month <= to.year * 12 + to.month) {
    const isFirstMonth = year === from.year && month === from.month;
    const isLastMonth = year === to.year && month === to.month;

    chunks.push({
      term: 'D',
      startYear: year,
      startMonth: month,
      startDay: isFirstMonth ? from.day : 1,
      endYear: year,
      endMonth: month,
      endDay: isLastMonth ? to.day : getLastDayOfMonth(year, month),
    });

    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }

  return chunks;
}

export async function fetchOpinetDieselDailyRange(
  input: FetchOpinetDieselDailyRangeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselPriceRow[]> {
  const from = parseIsoDate(input.from, 'from');
  const to = parseIsoDate(input.to, 'to');
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);

  if (fromKey > toKey) {
    throw new Error(
      `Opinet daily range start must not be after its end, received '${input.from}' to '${input.to}'.`,
    );
  }

  const fetchedAt = (input.now ?? new Date()).toISOString();
  const pricesByDate = new Map<string, number>();

  for (const chunk of createMonthChunks(from, to)) {
    const csvRows = await fetchOpinetStatsCsv(chunk, fetchImpl);

    for (const csvRow of csvRows) {
      const dateKey = toDateKey(parseDailyStatsLabel(csvRow.label));

      if (dateKey < fromKey || dateKey > toKey) {
        continue;
      }

      pricesByDate.set(dateKey, csvRow.price);
    }
  }

  const sortedEntries = Array.from(pricesByDate.entries()).sort(([leftDate], [rightDate]) =>
    leftDate.localeCompare(rightDate),
  );
  let previousPrice: number | null = null;

  return sortedEntries.map(([date, price]) => {
    const diff = previousPrice === null ? 0 : Number((price - previousPrice).toFixed(2));
    previousPrice = price;

    return {
      date,
      productCode: DIESEL_PRODUCT_CODE,
      productName: DIESEL_PRODUCT_NAME,
      price,
      diff,
      source: OPINET_STATS_DAILY_PRICE_SOURCE,
      fetchedAt,
    };
  });
}
