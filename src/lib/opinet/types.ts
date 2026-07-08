export interface OpinetAveragePriceRow {
  TRADE_DT: string;
  PRODCD: string;
  PRODNM: string;
  PRICE: string | number;
  DIFF: string | number;
}

export interface OpinetAveragePriceResult {
  OIL: OpinetAveragePriceRow[];
}

export interface OpinetAveragePriceResponse {
  RESULT: OpinetAveragePriceResult;
}

export interface OpinetRecentAveragePriceRow {
  DATE: string;
  PRODCD: string;
  PRICE: string | number;
}

export interface OpinetRecentAveragePriceResult {
  OIL: OpinetRecentAveragePriceRow[];
}

export interface OpinetRecentAveragePriceResponse {
  RESULT: OpinetRecentAveragePriceResult;
}

export interface NormalizedDieselPriceRow {
  date: string;
  productCode: string;
  productName: string;
  price: number;
  diff: number;
  source: string;
  fetchedAt: string;
}

export interface NormalizedDieselWeeklyPriceRow {
  weekKey: string;
  weekLabel: string;
  weekStartDate: string;
  weekEndDate: string;
  productCode: string;
  productName: string;
  price: number;
  source: string;
  fetchedAt: string;
}
