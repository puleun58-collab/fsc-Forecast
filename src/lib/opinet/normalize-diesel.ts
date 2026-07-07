import type {
  NormalizedDieselPriceRow,
  OpinetAveragePriceRow,
} from "./types";

const DIESEL_PRODUCT_CODE = "D047";
const DIESEL_PRODUCT_NAME = "자동차용경유";
const OPINET_AVERAGE_PRICE_SOURCE = "opinet-average-price";

function isDieselRow(row: OpinetAveragePriceRow): boolean {
  return row.PRODCD === DIESEL_PRODUCT_CODE || row.PRODNM === DIESEL_PRODUCT_NAME;
}

function parseRequiredNumber(value: string | number, fieldName: string): number {
  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid ${fieldName} value returned by Opinet.`);
  }

  return parsedValue;
}

export function normalizeDieselRows(
  rows: OpinetAveragePriceRow[],
  fetchedAt: string,
): NormalizedDieselPriceRow[] {
  return rows.filter(isDieselRow).map((row) => ({
    date: row.TRADE_DT,
    productCode: row.PRODCD,
    productName: row.PRODNM,
    price: parseRequiredNumber(row.PRICE, "PRICE"),
    diff: parseRequiredNumber(row.DIFF, "DIFF"),
    source: OPINET_AVERAGE_PRICE_SOURCE,
    fetchedAt,
  }));
}
