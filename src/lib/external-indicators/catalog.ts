import type { ExternalIndicatorCode, ExternalIndicatorDefinition } from "./types";

const EXTERNAL_INDICATOR_CATALOG = [
  {
    code: "dubai",
    name: "Dubai crude",
    unit: "usd_per_barrel",
    marketScope: "national-average",
  },
  {
    code: "brent",
    name: "Brent crude",
    unit: "usd_per_barrel",
    marketScope: "national-average",
  },
  {
    code: "wti",
    name: "WTI crude",
    unit: "usd_per_barrel",
    marketScope: "national-average",
  },
  {
    code: "usd-krw",
    name: "USD/KRW",
    unit: "krw_per_usd",
    marketScope: "national-average",
  },
] as const satisfies readonly ExternalIndicatorDefinition[];

export const externalIndicatorCatalog: readonly ExternalIndicatorDefinition[] =
  EXTERNAL_INDICATOR_CATALOG;

export const externalIndicatorCodes = EXTERNAL_INDICATOR_CATALOG.map(
  (indicator) => indicator.code,
) as readonly ExternalIndicatorCode[];

const externalIndicatorCatalogByCode = new Map<
  ExternalIndicatorCode,
  ExternalIndicatorDefinition
>(EXTERNAL_INDICATOR_CATALOG.map((indicator) => [indicator.code, indicator]));

export function isExternalIndicatorCode(value: string): value is ExternalIndicatorCode {
  return externalIndicatorCatalogByCode.has(value as ExternalIndicatorCode);
}

export function getExternalIndicatorDefinition(
  indicatorCode: ExternalIndicatorCode,
): ExternalIndicatorDefinition {
  return externalIndicatorCatalogByCode.get(indicatorCode)!;
}
