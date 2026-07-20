import type {
  ExternalIndicatorProvider,
  ExternalIndicatorProviderRequest,
  ExternalIndicatorProviderResult,
} from "./provider-contract";
import type { ExternalIndicatorCode, ExternalIndicatorPoint } from "./types";

const FRED_PROVIDER_KEY = "fred-public-csv";
const FRED_GRAPH_CSV_BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";

type FredIndicatorCode = Exclude<ExternalIndicatorCode, "dubai">;

const FRED_INDICATOR_CODES: readonly FredIndicatorCode[] = ["brent", "wti", "usd-krw"];

const FRED_SERIES_BY_CODE: Record<FredIndicatorCode, string> = {
  brent: "DCOILBRENTEU",
  wti: "DCOILWTICO",
  "usd-krw": "DEXKOUS",
};

function buildFredCsvUrl(seriesId: string): string {
  const url = new URL(FRED_GRAPH_CSV_BASE_URL);
  url.searchParams.set("id", seriesId);
  return url.toString();
}

function parseObservedAt(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`FRED returned an invalid DATE value: '${value}'.`);
  }

  return date;
}

function parseValue(value: string, seriesId: string): number | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed === ".") {
    return null;
  }

  const numericValue = Number(trimmed.replace(/,/g, ""));

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function matchesWindow(
  observedAt: Date,
  request: ExternalIndicatorProviderRequest,
): boolean {
  if (request.observedAtOrAfter && observedAt < request.observedAtOrAfter) {
    return false;
  }

  if (request.observedAtOrBefore && observedAt > request.observedAtOrBefore) {
    return false;
  }

  return true;
}

async function fetchFredSeries(
  indicatorCode: FredIndicatorCode,
  request: ExternalIndicatorProviderRequest,
): Promise<ExternalIndicatorPoint[]> {
  const seriesId = FRED_SERIES_BY_CODE[indicatorCode];
  const response = await (request.fetchImpl ?? fetch)(buildFredCsvUrl(seriesId), {
    method: "GET",
    headers: {
      Accept: "text/csv",
    },
    cache: "no-store",
    signal: request.signal,
  });

  if (!response.ok) {
    throw new Error(`FRED request for '${seriesId}' failed with status ${response.status}.`);
  }

  const csv = await response.text();
  const lines = csv.trim().split(/\r?\n/);

  if (lines.length < 2) {
    return [];
  }

  const points: ExternalIndicatorPoint[] = [];

  for (const line of lines.slice(1)) {
    const [dateValue, rawValue] = line.split(",", 2);

    if (!dateValue || rawValue === undefined) {
      continue;
    }

    const observedAt = parseObservedAt(dateValue.trim());

    if (!matchesWindow(observedAt, request)) {
      continue;
    }

    const numericValue = parseValue(rawValue, seriesId);

    if (numericValue === null) {
      continue;
    }

    points.push({
      indicatorCode,
      observedAt,
      value: numericValue,
      sourcePayload: {
        provider: FRED_PROVIDER_KEY,
        seriesId,
        date: dateValue.trim(),
        rawValue: rawValue.trim(),
        sourceUrl: buildFredCsvUrl(seriesId),
        frequency: "daily",
        unit: indicatorCode === "usd-krw" ? "krw_per_usd" : "usd_per_barrel",
        valueBasis: indicatorCode === "usd-krw" ? "new_york_noon_buying_rate" : "daily_close",
      },
    });
  }

  return points;
}

export const fredIndicatorProvider: ExternalIndicatorProvider = {
  providerKey: FRED_PROVIDER_KEY,
  supportedIndicatorCodes: FRED_INDICATOR_CODES,
  async fetchHistory(request: ExternalIndicatorProviderRequest): Promise<ExternalIndicatorProviderResult> {
    const requestedCodes = request.indicatorCodes.filter(
      (indicatorCode): indicatorCode is FredIndicatorCode => indicatorCode !== "dubai",
    );
    const uniqueCodes = [...new Set(requestedCodes)];
    const points = (
      await Promise.all(uniqueCodes.map((indicatorCode) => fetchFredSeries(indicatorCode, request)))
    ).flat();

    return {
      providerKey: FRED_PROVIDER_KEY,
      points,
    };
  },
};
