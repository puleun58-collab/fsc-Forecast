export const DASHBOARD_TIME_ZONE = 'Asia/Seoul';
export const DASHBOARD_TIME_ZONE_LABEL = 'KST';

export type DashboardDataFreshnessStatus = 'fresh' | 'delayed' | 'stale' | 'unavailable';

function parseDateValue(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatParts(
  value: Date,
  options: {
    includeTime: boolean;
  },
): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(options.includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      : {}),
  }).formatToParts(value);

  return Object.fromEntries(
    parts
      .filter((part) => ['year', 'month', 'day', 'hour', 'minute'].includes(part.type))
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

function formatDatePieces(year: string, month: string, day: string): string {
  return `${year}.${month}.${day}`;
}

function toKstDateKey(value: Date): string {
  const parts = formatParts(value, { includeTime: false });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDashboardDate(value: Date | string | null): string {
  if (value === null) {
    return '기록 없음';
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      return formatDatePieces(dateOnlyMatch[1], dateOnlyMatch[2], dateOnlyMatch[3]);
    }
  }

  const parsed = parseDateValue(value);
  if (parsed === null) {
    return '기록 없음';
  }

  const parts = formatParts(parsed, { includeTime: false });
  return formatDatePieces(parts.year, parts.month, parts.day);
}

export function formatDashboardDateTime(value: Date | string | null): string {
  const parsed = parseDateValue(value);
  if (parsed === null) {
    return '기록 없음';
  }

  const parts = formatParts(parsed, { includeTime: true });
  return `${formatDatePieces(parts.year, parts.month, parts.day)} ${parts.hour}:${parts.minute} ${DASHBOARD_TIME_ZONE_LABEL}`;
}

export function formatDashboardMonth(value: Date | string | null): string {
  const parsed = parseDateValue(value);
  if (parsed === null) {
    return '확인 불가';
  }

  const parts = formatParts(parsed, { includeTime: false });
  return `${parts.year}.${parts.month}`;
}

export function calculateDataDelayMinutes(dataBasisAt: Date | string | null, now = new Date()): number | null {
  const basisDate = parseDateValue(dataBasisAt);
  const currentDate = parseDateValue(now);

  if (basisDate === null || currentDate === null) {
    return null;
  }

  return Math.max(0, Math.floor((currentDate.getTime() - basisDate.getTime()) / 60_000));
}

export function formatDataDelay(delayMinutes: number | null): string {
  if (delayMinutes === null) {
    return '확인 불가';
  }

  const totalHours = Math.floor(delayMinutes / 60);
  const minutes = delayMinutes % 60;

  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}시간 ${minutes}분` : `${totalHours}시간`;
  }

  return `${minutes}분`;
}

export function calculateDataFreshness(
  dataBasisAt: Date | string | null,
  now = new Date(),
): DashboardDataFreshnessStatus {
  const basisDate = parseDateValue(dataBasisAt);
  const currentDate = parseDateValue(now);

  if (basisDate === null || currentDate === null) {
    return 'unavailable';
  }

  const basisKey = toKstDateKey(basisDate);
  const currentKey = toKstDateKey(currentDate);
  const [basisYear, basisMonth, basisDay] = basisKey.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = currentKey.split('-').map(Number);
  const basisKstDate = Date.UTC(basisYear, basisMonth - 1, basisDay);
  const currentKstDate = Date.UTC(currentYear, currentMonth - 1, currentDay);
  const delayDays = Math.max(0, Math.floor((currentKstDate - basisKstDate) / 86_400_000));

  if (delayDays <= 1) {
    return 'fresh';
  }

  if (delayDays <= 7) {
    return 'delayed';
  }

  return 'stale';
}
