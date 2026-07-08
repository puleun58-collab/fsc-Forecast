import { normalizeRecentDieselRows } from "./normalize-diesel";
import type {
  NormalizedDieselPriceRow,
  OpinetRecentAveragePriceResponse,
  OpinetRecentAveragePriceRow,
} from "./types";

const DEFAULT_OPINET_RECENT_PRICE_URL = "https://www.opinet.co.kr/api/avgRecentPrice.do?out=json";

function readRequiredApiKey(): string {
  const value = process.env.OPINET_API_KEY?.trim();

  if (!value) {
    throw new Error("Missing required environment variable: OPINET_API_KEY");
  }

  return value;
}

function readRecentPriceUrl(): string {
  return process.env.OPINET_RECENT_PRICE_URL?.trim() || DEFAULT_OPINET_RECENT_PRICE_URL;
}

function buildRecentPriceUrl(baseUrl: string, parameterName: "code" | "certkey", apiKey: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(parameterName, apiKey);
  url.searchParams.set("prodcd", "D047");
  return url.toString();
}

function isRecentAveragePriceRow(value: unknown): value is OpinetRecentAveragePriceRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.DATE === "string" &&
    typeof row.PRODCD === "string" &&
    (typeof row.PRICE === "string" || typeof row.PRICE === "number")
  );
}

function parseRecentPriceResponse(payload: unknown): OpinetRecentAveragePriceResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Opinet recent-price response: expected an object payload.");
  }

  const result = (payload as { RESULT?: unknown }).RESULT;

  if (!result || typeof result !== "object") {
    throw new Error("Invalid Opinet recent-price response: missing RESULT object.");
  }

  const oil = (result as { OIL?: unknown }).OIL;

  if (!Array.isArray(oil)) {
    throw new Error("Invalid Opinet recent-price response: RESULT.OIL must be an array.");
  }

  const rows = oil.filter(isRecentAveragePriceRow);

  if (rows.length !== oil.length) {
    throw new Error("Invalid Opinet recent-price response: RESULT.OIL contains malformed rows.");
  }

  return {
    RESULT: {
      OIL: rows,
    },
  };
}

async function requestRecentPrice(
  url: string,
  fetchImpl: typeof fetch,
): Promise<OpinetRecentAveragePriceResponse> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Opinet recent-price request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  return parseRecentPriceResponse(payload);
}

export async function fetchOpinetRecentDieselPrices(
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselPriceRow[]> {
  const apiKey = readRequiredApiKey();
  const baseUrl = readRecentPriceUrl();
  const fetchedAt = new Date().toISOString();

  const codeResponse = await requestRecentPrice(
    buildRecentPriceUrl(baseUrl, "code", apiKey),
    fetchImpl,
  );

  const rows = codeResponse.RESULT.OIL.length > 0
    ? codeResponse.RESULT.OIL
    : (
        await requestRecentPrice(
          buildRecentPriceUrl(baseUrl, "certkey", apiKey),
          fetchImpl,
        )
      ).RESULT.OIL;

  return normalizeRecentDieselRows(rows, fetchedAt);
}
