import type { DashboardTrendDirection } from './fsc-types';

const KOREA_TIME_ZONE = 'Asia/Seoul';
const PRICE_FORMATTER = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PERCENT_FORMATTER = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseDateInput(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    return new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed;
}

function formatPartsInTimeZone(value: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);

  const picked = Object.fromEntries(
    parts
      .filter((part) => ['year', 'month', 'day', 'hour', 'minute'].includes(part.type))
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;

  return picked;
}

function formatDatePieces(year: string, month: string, day: string): string {
  return `${year}.${month}.${day}`;
}

export function formatPriceNumber(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric price value: ${value}`);
  }

  return PRICE_FORMATTER.format(parsed);
}

export function formatPriceText(value: number | string | null, fallback = '기록 없음'): string {
  if (value === null) {
    return fallback;
  }

  return `${formatPriceNumber(value)}원/L`;
}

export function formatPercentText(value: number | string | null, fallback = '기록 없음'): string {
  if (value === null) {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid percentage value: ${value}`);
  }

  return `${parsed > 0 ? '+' : ''}${PERCENT_FORMATTER.format(parsed)}%`;
}

export function formatRatioPercentText(value: number | string | null, fallback = '기록 없음'): string {
  if (value === null) {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ratio value: ${value}`);
  }

  return `${PERCENT_FORMATTER.format(parsed * 100)}%`;
}

export function formatDotDate(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      return formatDatePieces(dateOnlyMatch[1], dateOnlyMatch[2], dateOnlyMatch[3]);
    }
  }

  const parsed = parseDateInput(value);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return formatDatePieces(String(year), month, day);
}

export function formatDotDateTime(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  const parsed = parseDateInput(value);
  const parts = formatPartsInTimeZone(parsed);
  return `${formatDatePieces(parts.year, parts.month, parts.day)} ${parts.hour}:${parts.minute}`;
}

export function formatQuarterLabel(year: number, quarter: number): string {
  return `${year}년 ${quarter}분기`;
}

export function formatShortMonthLabel(value: string): string {
  const match = value.match(/(\d{1,2})월$/);
  if (match) {
    return `${Number(match[1])}월`;
  }

  return value;
}

export function formatCompactDateRange(start: string | Date, end: string | Date): string {
  const startText = formatDotDate(start);
  const endText = formatDotDate(end);

  if (startText === null || endText === null) {
    throw new Error('Date range values are required.');
  }

  const [startYear, startMonth, startDay] = startText.split('.');
  const [endYear, endMonth, endDay] = endText.split('.');

  if (startYear === endYear) {
    return `${startYear}.${startMonth}.${startDay}–${endMonth}.${endDay}`;
  }

  return `${startText}–${endText}`;
}

export function getDirectionalChangeDisplay(
  direction: DashboardTrendDirection,
  absoluteChangeKrwPerL: number | null,
  percentChange: number | null,
): {
  icon: '▲' | '▼' | '•';
  label: '상승' | '하락' | '보합';
  amountText: string;
  percentText: string;
} {
  const icon = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';
  const label = direction === 'up' ? '상승' : direction === 'down' ? '하락' : '보합';
  const magnitude = absoluteChangeKrwPerL === null ? null : Math.abs(absoluteChangeKrwPerL);

  return {
    icon,
    label,
    amountText: magnitude === null ? '비교 불가' : `${formatPriceNumber(magnitude)}원`,
    percentText: percentChange === null ? '비교 불가' : `${percentChange > 0 ? '+' : ''}${PERCENT_FORMATTER.format(percentChange)}%`,
  };
}

export function calculateRecentAverage(points: ReadonlyArray<{ priceKrwPerL: number }>, count: number): number | null {
  if (points.length === 0) {
    return null;
  }

  const slice = points.slice(-Math.min(points.length, count));
  return slice.reduce((sum, point) => sum + point.priceKrwPerL, 0) / slice.length;
}
