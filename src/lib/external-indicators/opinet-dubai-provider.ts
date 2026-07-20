import type {
  ExternalIndicatorProvider,
  ExternalIndicatorProviderRequest,
  ExternalIndicatorProviderResult,
} from './provider-contract';
import type { ExternalIndicatorPoint } from './types';

export const OPINET_DUBAI_PROVIDER_KEY = 'opinet-dubai-daily';
export const OPINET_DUBAI_SOURCE_URL = 'https://www.opinet.co.kr/glopcoilSelect.do';

const DEFAULT_LOOKBACK_DAYS = 21;
const OPINET_DATE_PATTERN = /^(\d{2}|\d{4})년(\d{2})월(\d{2})일$/;

function formatDateKey(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll('-', '');
}

function getKstToday(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return new Date(
    Date.UTC(Number(values.get('year')), Number(values.get('month')) - 1, Number(values.get('day'))),
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .trim();
}

function parseOpinetDate(value: string): Date | null {
  const match = OPINET_DATE_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const rawYear = Number(match[1]);
  const year = match[1].length === 2 ? 2000 + rawYear : rawYear;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const observedAt = new Date(Date.UTC(year, month - 1, day));

  if (
    observedAt.getUTCFullYear() !== year ||
    observedAt.getUTCMonth() !== month - 1 ||
    observedAt.getUTCDate() !== day
  ) {
    return null;
  }

  return observedAt;
}

function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed === '.') {
    return null;
  }

  const numericValue = Number(trimmed.replaceAll(',', ''));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function isWithinWindow(observedAt: Date, request: ExternalIndicatorProviderRequest): boolean {
  if (request.observedAtOrAfter && observedAt < request.observedAtOrAfter) {
    return false;
  }

  if (request.observedAtOrBefore && observedAt > request.observedAtOrBefore) {
    return false;
  }

  return true;
}

export function parseOpinetDubaiDailyHtml(
  html: string,
  request: ExternalIndicatorProviderRequest = { indicatorCodes: ['dubai'] },
): ExternalIndicatorPoint[] {
  const tbodyMatch = /<tbody\b[^>]*\bid=["']tbody2["'][^>]*>([\s\S]*?)<\/tbody>/i.exec(html);

  if (!tbodyMatch) {
    throw new Error('Opinet Dubai response did not contain the USD/BBL daily result table.');
  }

  const pointsByDate = new Map<string, ExternalIndicatorPoint>();
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of tbodyMatch[1].matchAll(rowPattern)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripHtml(match[1]));

    if (cells.length < 2) {
      continue;
    }

    const observedAt = parseOpinetDate(cells[0]);
    const value = parsePositiveNumber(cells[1]);

    if (!observedAt || value === null || !isWithinWindow(observedAt, request)) {
      continue;
    }

    const dateKey = observedAt.toISOString();
    const existing = pointsByDate.get(dateKey);

    if (existing && existing.value !== value) {
      throw new Error(`Opinet returned conflicting Dubai values for '${dateKey.slice(0, 10)}'.`);
    }

    pointsByDate.set(dateKey, {
      indicatorCode: 'dubai',
      observedAt,
      value,
      sourcePayload: {
        provider: OPINET_DUBAI_PROVIDER_KEY,
        sourceUrl: OPINET_DUBAI_SOURCE_URL,
        instrument: 'Dubai spot estimate',
        frequency: 'daily',
        unit: 'usd_per_barrel',
        valueBasis: 'dubai_spot_estimate',
        date: cells[0],
        rawValue: cells[1],
      },
    });
  }

  return [...pointsByDate.values()].sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
}

function resolveWindow(request: ExternalIndicatorProviderRequest): { start: Date; end: Date } {
  const end = request.observedAtOrBefore ?? getKstToday();
  const start = request.observedAtOrAfter ?? new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  return { start, end };
}

export const opinetDubaiProvider: ExternalIndicatorProvider = {
  providerKey: OPINET_DUBAI_PROVIDER_KEY,
  supportedIndicatorCodes: ['dubai'],
  async fetchHistory(request: ExternalIndicatorProviderRequest): Promise<ExternalIndicatorProviderResult> {
    if (!request.indicatorCodes.includes('dubai')) {
      return { providerKey: OPINET_DUBAI_PROVIDER_KEY, points: [] };
    }

    const { start, end } = resolveWindow(request);
    const body = new URLSearchParams({
      TERM: 'D',
      STDDATE: formatDateKey(start),
      ENDDATE: formatDateKey(end),
      SEL_DIV: 'div_dar',
      OILSRTCD1: '001',
      OILSRTCD2: '002',
      OILSRTCD3: '003',
    });
    const response = await (request.fetchImpl ?? fetch)(OPINET_DUBAI_SOURCE_URL, {
      method: 'POST',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      cache: 'no-store',
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`Opinet Dubai request failed with status ${response.status}.`);
    }

    const points = parseOpinetDubaiDailyHtml(await response.text(), request);

    if (points.length === 0) {
      throw new Error('Opinet Dubai response contained no valid daily observations.');
    }

    return { providerKey: OPINET_DUBAI_PROVIDER_KEY, points };
  },
};
