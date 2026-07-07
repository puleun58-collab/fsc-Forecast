import { normalizeDieselRows } from "./normalize-diesel";
import type {
  NormalizedDieselPriceRow,
  OpinetAveragePriceResponse,
  OpinetAveragePriceRow,
} from "./types";

function readRequiredEnv(name: "OPINET_API_KEY" | "OPINET_AVG_PRICE_URL"): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildAveragePriceUrl(baseUrl: string, parameterName: "code" | "certkey", apiKey: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(parameterName, apiKey);
  return url.toString();
}

function isAveragePriceRow(value: unknown): value is OpinetAveragePriceRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.TRADE_DT === "string" &&
    typeof row.PRODCD === "string" &&
    typeof row.PRODNM === "string" &&
    (typeof row.PRICE === "string" || typeof row.PRICE === "number") &&
    (typeof row.DIFF === "string" || typeof row.DIFF === "number")
  );
}

function parseAveragePriceResponse(payload: unknown): OpinetAveragePriceResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Opinet response: expected an object payload.");
  }

  const result = (payload as { RESULT?: unknown }).RESULT;

  if (!result || typeof result !== "object") {
    throw new Error("Invalid Opinet response: missing RESULT object.");
  }

  const oil = (result as { OIL?: unknown }).OIL;

  if (!Array.isArray(oil)) {
    throw new Error("Invalid Opinet response: RESULT.OIL must be an array.");
  }

  const rows = oil.filter(isAveragePriceRow);

  if (rows.length !== oil.length) {
    throw new Error("Invalid Opinet response: RESULT.OIL contains malformed rows.");
  }

  return {
    RESULT: {
      OIL: rows,
    },
  };
}

async function requestAveragePrice(
  url: string,
  fetchImpl: typeof fetch,
): Promise<OpinetAveragePriceResponse> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Opinet average-price request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  return parseAveragePriceResponse(payload);
}

export async function fetchOpinetAverageDieselPrices(
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselPriceRow[]> {
  const apiKey = readRequiredEnv("OPINET_API_KEY");
  const baseUrl = readRequiredEnv("OPINET_AVG_PRICE_URL");
  const fetchedAt = new Date().toISOString();

  const codeResponse = await requestAveragePrice(
    buildAveragePriceUrl(baseUrl, "code", apiKey),
    fetchImpl,
  );

  const rows = codeResponse.RESULT.OIL.length > 0
    ? codeResponse.RESULT.OIL
    : (
        await requestAveragePrice(
          buildAveragePriceUrl(baseUrl, "certkey", apiKey),
          fetchImpl,
        )
      ).RESULT.OIL;

  return normalizeDieselRows(rows, fetchedAt);
}

export const fetchAveragePriceDiesel = fetchOpinetAverageDieselPrices;
