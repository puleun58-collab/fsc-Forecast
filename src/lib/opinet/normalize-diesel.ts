import { createOpinetWeekStartDate, getOpinetWeekEnd } from "./weekly-period";

import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselPriceRow,
  NormalizedDieselWeeklyPriceRow,
  OpinetAveragePriceRow,
  OpinetRecentAveragePriceRow,
} from "./types";

export const DIESEL_PRODUCT_CODE = "D047";
export const DIESEL_PRODUCT_NAME = "자동차용경유";
export const OPINET_DAILY_AVERAGE_PRICE_SOURCE = "opinet-daily-average-price";
export const OPINET_DAILY_RECENT_PRICE_SOURCE = "opinet-recent-daily-average-price";
const OPINET_WEEKLY_PRICE_SOURCE = "opinet-weekly-average-price";
const OPINET_MONTHLY_PRICE_SOURCE = "opinet-monthly-average-price";
function isCurrentDieselRow(row: OpinetAveragePriceRow): boolean {
  return row.PRODCD === DIESEL_PRODUCT_CODE || row.PRODNM === DIESEL_PRODUCT_NAME;
}

function isRecentDieselRow(row: OpinetRecentAveragePriceRow): boolean {
  return row.PRODCD === DIESEL_PRODUCT_CODE;
}

export function parseRequiredNumber(value: string | number, fieldName: string): number {
  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid ${fieldName} value returned by Opinet.`);
  }

  return parsedValue;
}

function formatWeekKey(year: number, month: number, week: number): string {
  return `${year}${String(month).padStart(2, "0")}${week}`;
}


function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthKey(year: number, month: number): string {
  return `${year}${String(month).padStart(2, "0")}`;
}

function createMonthStartDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function createMonthEndDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export function parseWeeklyLabel(label: string): { year: number; month: number; week: number } {
  const match = label.match(/^(\d{4})년(\d{2})월(\d)주$/);

  if (!match) {
    throw new Error(`Unexpected Opinet weekly label: ${label}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    week: Number(match[3]),
  };
}

export function parseMonthlyLabel(label: string): { year: number; month: number } {
  const match = label.match(/^(\d{4})년(\d{2})월$/);

  if (!match) {
    throw new Error(`Unexpected Opinet monthly label: ${label}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

export function normalizeCurrentDieselRows(
  rows: OpinetAveragePriceRow[],
  fetchedAt: string,
): NormalizedDieselPriceRow[] {
  return rows.filter(isCurrentDieselRow).map((row) => ({
    date: row.TRADE_DT,
    productCode: DIESEL_PRODUCT_CODE,
    productName: DIESEL_PRODUCT_NAME,
    price: parseRequiredNumber(row.PRICE, "PRICE"),
    diff: parseRequiredNumber(row.DIFF, "DIFF"),
    source: OPINET_DAILY_AVERAGE_PRICE_SOURCE,
    fetchedAt,
  }));
}

export function normalizeRecentDieselRows(
  rows: OpinetRecentAveragePriceRow[],
  fetchedAt: string,
): NormalizedDieselPriceRow[] {
  const dieselRows = rows
    .filter(isRecentDieselRow)
    .map((row) => ({
      date: row.DATE,
      productCode: DIESEL_PRODUCT_CODE,
      productName: DIESEL_PRODUCT_NAME,
      price: parseRequiredNumber(row.PRICE, "PRICE"),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return dieselRows.map((row, index) => ({
    date: row.date,
    productCode: row.productCode,
    productName: row.productName,
    price: row.price,
    diff: index === 0 ? 0 : Number((row.price - dieselRows[index - 1].price).toFixed(2)),
    source: OPINET_DAILY_RECENT_PRICE_SOURCE,
    fetchedAt,
  }));
}

export function normalizeWeeklyDieselRow(
  input: {
    year: number;
    month: number;
    week: number;
    label: string;
    price: number;
  },
  fetchedAt: string,
): NormalizedDieselWeeklyPriceRow {
  const weekStartDate = createOpinetWeekStartDate(input.year, input.month, input.week);
  const weekEndDate = getOpinetWeekEnd(weekStartDate);

  return {
    weekKey: formatWeekKey(input.year, input.month, input.week),
    weekLabel: input.label,
    weekStartDate: formatUtcDate(weekStartDate),
    weekEndDate: formatUtcDate(weekEndDate),
    productCode: DIESEL_PRODUCT_CODE,
    productName: DIESEL_PRODUCT_NAME,
    price: input.price,
    source: OPINET_WEEKLY_PRICE_SOURCE,
    fetchedAt,
  };
}

export function normalizeMonthlyDieselRow(
  input: {
    year: number;
    month: number;
    label: string;
    price: number;
  },
  fetchedAt: string,
): NormalizedDieselMonthlyPriceRow {
  const monthStartDate = createMonthStartDate(input.year, input.month);
  const monthEndDate = createMonthEndDate(input.year, input.month);

  return {
    monthKey: formatMonthKey(input.year, input.month),
    monthLabel: input.label,
    monthStartDate: formatUtcDate(monthStartDate),
    monthEndDate: formatUtcDate(monthEndDate),
    productCode: DIESEL_PRODUCT_CODE,
    productName: DIESEL_PRODUCT_NAME,
    price: input.price,
    source: OPINET_MONTHLY_PRICE_SOURCE,
    fetchedAt,
  };
}

export const normalizeDieselRows = normalizeCurrentDieselRows;
