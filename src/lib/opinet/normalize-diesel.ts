import type {
  NormalizedDieselPriceRow,
  NormalizedDieselWeeklyPriceRow,
  OpinetAveragePriceRow,
  OpinetRecentAveragePriceRow,
} from "./types";

export const DIESEL_PRODUCT_CODE = "D047";
export const DIESEL_PRODUCT_NAME = "자동차용경유";
const OPINET_DAILY_PRICE_SOURCE = "opinet-daily-average-price";
const OPINET_WEEKLY_PRICE_SOURCE = "opinet-weekly-average-price";

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

function createWeekStartDate(year: number, month: number, week: number): Date {
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekStart = new Date(firstDayOfMonth);
  firstWeekStart.setUTCDate(firstDayOfMonth.getUTCDate() - firstDayOfMonth.getUTCDay());
  firstWeekStart.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date(firstWeekStart);
  weekStart.setUTCDate(firstWeekStart.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    source: OPINET_DAILY_PRICE_SOURCE,
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
    source: OPINET_DAILY_PRICE_SOURCE,
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
  const weekStartDate = createWeekStartDate(input.year, input.month, input.week);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);

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

export const normalizeDieselRows = normalizeCurrentDieselRows;
