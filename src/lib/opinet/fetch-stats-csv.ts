const DEFAULT_OPINET_STATS_PRICE_URL = "https://www.opinet.co.kr/user/dopospdrg/dopOsPdrgSelect.do";
const STATS_CSV_PATH = "/user/dopospdrg/dopOsPdrgCsv.do";
const EUC_KR_DECODER = new TextDecoder("euc-kr");

export type OpinetStatsTerm = "W" | "M" | "Q";

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

interface BaseStatsRange {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

export interface WeeklyStatsRange extends BaseStatsRange {
  term: "W";
  startWeek: number;
  endWeek: number;
}

export interface MonthlyStatsRange extends BaseStatsRange {
  term: "M";
}

export interface QuarterlyStatsRange extends BaseStatsRange {
  term: "Q";
  startQuarter: number;
  endQuarter: number;
}

export type OpinetStatsRange = WeeklyStatsRange | MonthlyStatsRange | QuarterlyStatsRange;

export interface OpinetStatsCsvRow {
  label: string;
  price: number;
}

function readStatsPageUrl(): string {
  return process.env.OPINET_STATS_PRICE_URL?.trim() || DEFAULT_OPINET_STATS_PRICE_URL;
}

function parseRequiredNumber(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldName} value returned by Opinet stats CSV.`);
  }

  return parsed;
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

function buildStatsFormData(state: StatsPageState, range: OpinetStatsRange): URLSearchParams {
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
  formData.set("TERM", range.term);
  formData.set("STA_Y", String(range.startYear));
  formData.set("STA_M", String(range.startMonth).padStart(2, "0"));
  formData.set("END_Y", String(range.endYear));
  formData.set("END_M", String(range.endMonth).padStart(2, "0"));

  if (range.term === "W") {
    formData.set("STA_W", String(range.startWeek));
    formData.set("END_W", String(range.endWeek));
  }

  if (range.term === "Q") {
    formData.set("STA_Q", String(range.startQuarter));
    formData.set("END_Q", String(range.endQuarter));
  }

  formData.set("OIL_CD_D047", "Y");
  formData.set("equal", state.equalFlag);
  return formData;
}

function parseStatsCsvRows(csvText: string): OpinetStatsCsvRow[] {
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
      throw new Error(`Unexpected Opinet stats CSV row: ${line}`);
    }

    return {
      label: label.trim(),
      price: parseRequiredNumber(price.trim(), "PRICE"),
    };
  });
}

async function fetchStatsPage(fetchImpl: typeof fetch): Promise<StatsPageState> {
  const stateUrl = readStatsPageUrl();
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

export function parseLatestWeeklyToken(value: string): {
  year: number;
  month: number;
  week: number;
} {
  if (!/^\d{7}$/.test(value)) {
    throw new Error(`Unexpected Opinet weekly token: ${value}`);
  }

  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    week: Number(value.slice(6, 7)),
  };
}

export function getPreviousWeeklyToken(candidate: {
  year: number;
  month: number;
  week: number;
}): { year: number; month: number; week: number } {
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

export async function fetchOpinetStatsCsv(
  range: OpinetStatsRange,
  fetchImpl: typeof fetch = fetch,
): Promise<OpinetStatsCsvRow[]> {
  const state = await fetchStatsPage(fetchImpl);
  const response = await fetchImpl(state.csvUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: buildStatsFormData(state, range).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Opinet stats CSV request failed with status ${response.status}.`);
  }

  const csvText = EUC_KR_DECODER.decode(await response.arrayBuffer());
  return parseStatsCsvRows(csvText);
}

export async function fetchOpinetStatsPageState(fetchImpl: typeof fetch = fetch): Promise<{
  maxYear: string;
  maxMonth: string;
  maxWeek: string;
}> {
  const state = await fetchStatsPage(fetchImpl);
  return {
    maxYear: state.maxYear,
    maxMonth: state.maxMonth,
    maxWeek: state.maxWeek,
  };
}
