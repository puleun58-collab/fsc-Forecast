export type DataHealthStatus = 'healthy' | 'delayed' | 'error' | 'missing';

export type DataHealthSourceCode = 'opinet-daily' | 'opinet-weekly' | 'dubai' | 'usd-krw';

export type DataHealthItem = {
  sourceCode: DataHealthSourceCode;
  source: string;
  status: DataHealthStatus;
  latestDataAt: string | null;
  latestDataLabel: string | null;
  lastCollectedAt: string | null;
  expectedLatestDate: string;
  delayLabel: string | null;
  errorAt: string | null;
  errorMessage: string | null;
};

export type DataHealthSummary = {
  status: DataHealthStatus;
  label: string;
  items: readonly DataHealthItem[];
};

export type DataCollectionState = 'checking' | 'succeeded' | 'failed' | null;

type BuildDataHealthItemInput = {
  sourceCode: DataHealthSourceCode;
  source: string;
  latestDataAt: Date | string | null;
  latestDataLabel?: string | null;
  lastCollectedAt: Date | string | null;
  collectionState: DataCollectionState;
  errorAt?: Date | string | null;
  errorMessage?: string | null;
  now?: Date;
  closedDates?: ReadonlySet<string>;
};

const DAY_MS = 86_400_000;
const DATA_SOURCE_BUSINESS_DAY_LAG: Record<Exclude<DataHealthSourceCode, 'opinet-weekly'>, number> = {
  'opinet-daily': 1,
  dubai: 2,
  'usd-krw': 1,
};

function toDateKey(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})/.exec(value);

    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shiftDateKey(dateKey: string, dayCount: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

function getWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function isBusinessDate(dateKey: string, closedDates: ReadonlySet<string>): boolean {
  const weekday = getWeekday(dateKey);
  return weekday !== 0 && weekday !== 6 && !closedDates.has(dateKey);
}

const KST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function getKstNowParts(now: Date): { dateKey: string; hour: number } {
  const parts = KST_PARTS_FORMATTER.formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    dateKey: `${values.get('year')}-${values.get('month')}-${values.get('day')}`,
    hour: Number(values.get('hour')),
  };
}

function previousBusinessDate(
  fromDateKey: string,
  businessDayCount: number,
  closedDates: ReadonlySet<string>,
): string {
  let candidate = fromDateKey;
  let remaining = businessDayCount;

  while (remaining > 0) {
    candidate = shiftDateKey(candidate, -1);

    if (isBusinessDate(candidate, closedDates)) {
      remaining -= 1;
    }
  }

  return candidate;
}

function getExpectedWeeklyDate(now: Date): string {
  const { dateKey, hour } = getKstNowParts(now);
  const weekday = getWeekday(dateKey);
  let daysSinceThursday = (weekday - 4 + 7) % 7;

  if (daysSinceThursday === 0 || (weekday === 5 && hour < 12)) {
    daysSinceThursday += 7;
  }

  return shiftDateKey(dateKey, -daysSinceThursday);
}

export function getExpectedLatestDate(
  sourceCode: DataHealthSourceCode,
  now = new Date(),
  closedDates: ReadonlySet<string> = new Set(),
): string {
  if (sourceCode === 'opinet-weekly') {
    return getExpectedWeeklyDate(now);
  }

  const { dateKey } = getKstNowParts(now);
  return previousBusinessDate(dateKey, DATA_SOURCE_BUSINESS_DAY_LAG[sourceCode], closedDates);
}

export function getLatestObservation(values: readonly (Date | string | null)[]): Date | null {
  let latest: Date | null = null;

  for (const value of values) {
    if (value === null) {
      continue;
    }

    const candidate = value instanceof Date ? new Date(value.getTime()) : new Date(value);

    if (!Number.isNaN(candidate.getTime()) && (latest === null || candidate > latest)) {
      latest = candidate;
    }
  }

  return latest;
}

export function getDataHealthStatus(input: {
  sourceCode: DataHealthSourceCode;
  latestDataAt: Date | string | null;
  collectionState: DataCollectionState;
  now?: Date;
  closedDates?: ReadonlySet<string>;
}): DataHealthStatus {
  if (input.collectionState === 'failed') {
    return 'error';
  }

  const latestDateKey = toDateKey(input.latestDataAt);

  if (latestDateKey === null) {
    return 'missing';
  }

  const expectedLatestDate = getExpectedLatestDate(
    input.sourceCode,
    input.now,
    input.closedDates,
  );
  return latestDateKey < expectedLatestDate ? 'delayed' : 'healthy';
}

function countBusinessDateDelay(
  latestDateKey: string,
  expectedDateKey: string,
  closedDates: ReadonlySet<string>,
): number {
  let delayedDays = 0;

  for (
    let candidate = shiftDateKey(latestDateKey, 1);
    candidate <= expectedDateKey;
    candidate = shiftDateKey(candidate, 1)
  ) {
    if (isBusinessDate(candidate, closedDates)) {
      delayedDays += 1;
    }
  }

  return delayedDays;
}

function buildDelayLabel(
  sourceCode: DataHealthSourceCode,
  latestDataAt: Date | string | null,
  expectedLatestDate: string,
  status: DataHealthStatus,
  closedDates: ReadonlySet<string>,
): string | null {
  const latestDateKey = toDateKey(latestDataAt);

  if (status !== 'delayed' || latestDateKey === null) {
    return null;
  }

  if (sourceCode === 'opinet-weekly') {
    const elapsedDays = Math.max(
      1,
      Math.round(
        (new Date(`${expectedLatestDate}T00:00:00.000Z`).getTime() -
          new Date(`${latestDateKey}T00:00:00.000Z`).getTime()) /
          DAY_MS,
      ),
    );
    return `${Math.max(1, Math.ceil(elapsedDays / 7))}주차 지연`;
  }

  return `${Math.max(1, countBusinessDateDelay(latestDateKey, expectedLatestDate, closedDates))}영업일 지연`;
}

export function buildDataHealthItem(input: BuildDataHealthItemInput): DataHealthItem {
  const now = input.now ?? new Date();
  const closedDates = input.closedDates ?? new Set<string>();
  const status = getDataHealthStatus({
    sourceCode: input.sourceCode,
    latestDataAt: input.latestDataAt,
    collectionState: input.collectionState,
    now,
    closedDates,
  });
  const expectedLatestDate = getExpectedLatestDate(input.sourceCode, now, closedDates);

  return {
    sourceCode: input.sourceCode,
    source: input.source,
    status,
    latestDataAt: toIsoString(input.latestDataAt),
    latestDataLabel: input.latestDataLabel ?? null,
    lastCollectedAt: toIsoString(input.lastCollectedAt),
    expectedLatestDate,
    delayLabel: buildDelayLabel(
      input.sourceCode,
      input.latestDataAt,
      expectedLatestDate,
      status,
      closedDates,
    ),
    errorAt: status === 'error' ? toIsoString(input.errorAt) : null,
    errorMessage: status === 'error' ? input.errorMessage ?? `${input.source} 데이터 수집 요청 실패` : null,
  };
}

export function summarizeDataHealth(items: readonly DataHealthItem[]): DataHealthSummary {
  const errorCount = items.filter((item) => item.status === 'error').length;
  const delayedCount = items.filter((item) => item.status === 'delayed').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;

  if (errorCount > 0) {
    return { status: 'error', label: '확인 필요', items };
  }

  if (delayedCount > 0) {
    return { status: 'delayed', label: `${delayedCount}개 지연`, items };
  }

  if (missingCount > 0) {
    return { status: 'missing', label: '데이터 없음', items };
  }

  return { status: 'healthy', label: '모두 최신', items };
}
