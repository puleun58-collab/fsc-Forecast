import { normalizeWeeklyDieselRow, parseRequiredNumber } from "./normalize-diesel";
import type { NormalizedDieselWeeklyPriceRow } from "./types";

const DEFAULT_OPINET_STATS_PRICE_URL = "https://www.opinet.co.kr/user/dopospdrg/dopOsPdrgSelect.do";
const STATS_CSV_PATH = "/user/dopospdrg/dopOsPdrgCsv.do";
const EUC_KR_DECODER = new TextDecoder("euc-kr");

interface StatsPageState {
  allChkCount: string;
  initialFlag: string;
  maxYear: string;
  maxQuarter: string;
  maxMonth: string;
  maxDay: string;
  maxWeek: string;
  equalFlag: string;
  csvUrl: string;
}

interface WeeklyCandidate {
  year: number;
  month: number;
  week: number;
}

function readStatsPageUrl(): string {
  return process.env.OPINET_STATS_PRICE_URL?.trim() || DEFAULT_OPINET_STATS_PRICE_URL;
}

function parseStatsPageState(pageUrl: string, html: string): StatsPageState {
  const readHiddenValue = (name: string): string => {
    const pattern = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`, "i");
    const match = html.match(pattern);

    if (!match?.[1]) {
      throw new Error(`Failed to parse hidden Opinet stats value: ${name}`);
    }

    return match[1].trim();
  };

  const baseUrl = new URL(pageUrl);
  const csvUrl = new URL(STATS_CSV_PATH, `${baseUrl.origin}/`).toString();

  return {
    allChkCount: readHiddenValue("all_chk_cnt"),
    initialFlag: readHiddenValue("INIF_FLAG"),
    maxYear: readHiddenValue("h_maxYY"),
    maxQuarter: readHiddenValue("h_maxQQ"),
    maxMonth: readHiddenValue("h_maxMM"),
    maxDay: readHiddenValue("h_maxDD"),
    maxWeek: readHiddenValue("h_maxWW"),
    equalFlag: readHiddenValue("equal"),
    csvUrl,
  };
}

function parseWeeklyCandidate(value: string): WeeklyCandidate {
  if (!/^\d{7}$/.test(value)) {
    throw new Error(`Unexpected Opinet weekly token: ${value}`);
  }

  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    week: Number(value.slice(6, 7)),
  };
}

function getPreviousWeeklyCandidate(candidate: WeeklyCandidate): WeeklyCandidate {
  if (candidate.week > 1) {
    return {
      year: candidate.year,
      month: candidate.month,
      week: candidate.week - 1,
    };
  }

  const previousMonthDate = new Date(Date.UTC(candidate.year, candidate.month - 2, 1));

  return {
    year: previousMonthDate.getUTCFullYear(),
    month: previousMonthDate.getUTCMonth() + 1,
    week: 5,
  };
}

function buildWeeklyFormData(state: StatsPageState, candidate: WeeklyCandidate): URLSearchParams {
  const formData = new URLSearchParams();
  formData.set("all_chk_cnt", state.allChkCount);
  formData.set("INIF_FLAG", state.initialFlag);
  formData.set("chk_cnt", "1");
  formData.set("h_maxYY", state.maxYear);
  formData.set("h_maxQQ", state.maxQuarter);
  formData.set("h_maxMM", state.maxMonth);
  formData.set("h_maxDD", state.maxDay);
  formData.set("h_maxWW", state.maxWeek);
  formData.set("sta_dt", "");
  formData.set("end_dt", "");
  formData.set("TERM", "W");
  formData.set("STA_Y", String(candidate.year));
  formData.set("STA_M", String(candidate.month).padStart(2, "0"));
  formData.set("STA_W", String(candidate.week));
  formData.set("END_Y", String(candidate.year));
  formData.set("END_M", String(candidate.month).padStart(2, "0"));
  formData.set("END_W", String(candidate.week));
  formData.set("OIL_CD_D047", "Y");
  formData.set("equal", state.equalFlag);
  return formData;
}

function parseWeeklyCsvRows(csvText: string): Array<{ label: string; price: number }> {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const [label, price] = line.split(",");

    if (!label || price === undefined) {
      throw new Error(`Unexpected Opinet weekly CSV row: ${line}`);
    }

    return {
      label: label.trim(),
      price: parseRequiredNumber(price.trim(), "PRICE"),
    };
  });
}

async function fetchStatsPage(stateUrl: string, fetchImpl: typeof fetch): Promise<StatsPageState> {
  const response = await fetchImpl(stateUrl, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Opinet stats page request failed with status ${response.status}.`);
  }

  const html = await response.text();
  return parseStatsPageState(stateUrl, html);
}

async function fetchWeeklyCsv(
  state: StatsPageState,
  candidate: WeeklyCandidate,
  fetchImpl: typeof fetch,
): Promise<Array<{ label: string; price: number }>> {
  const response = await fetchImpl(state.csvUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: buildWeeklyFormData(state, candidate).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Opinet weekly CSV request failed with status ${response.status}.`);
  }

  const csvText = EUC_KR_DECODER.decode(await response.arrayBuffer());
  return parseWeeklyCsvRows(csvText);
}

export async function fetchLatestOpinetWeeklyDieselPrice(
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedDieselWeeklyPriceRow[]> {
  const state = await fetchStatsPage(readStatsPageUrl(), fetchImpl);
  const fetchedAt = new Date().toISOString();
  let candidate = parseWeeklyCandidate(state.maxWeek);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const rows = await fetchWeeklyCsv(state, candidate, fetchImpl);

    if (rows.length > 0) {
      return rows.map((row) => normalizeWeeklyDieselRow({
        year: candidate.year,
        month: candidate.month,
        week: candidate.week,
        label: row.label,
        price: row.price,
      }, fetchedAt));
    }

    candidate = getPreviousWeeklyCandidate(candidate);
  }

  throw new Error("Opinet weekly diesel collector could not find a published weekly average in the recent search window.");
}
