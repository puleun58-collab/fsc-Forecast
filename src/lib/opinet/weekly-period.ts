export const OPINET_WEEKLY_COLLECTION_DAY_COUNT = 5;

export interface OpinetDisplayWeek {
  year: number;
  month: number;
  weekOfMonth: number;
}

function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function createOpinetWeekStartDate(year: number, month: number, week: number): Date {
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekStart = new Date(firstDayOfMonth);
  firstWeekStart.setUTCDate(firstDayOfMonth.getUTCDate() - firstDayOfMonth.getUTCDay());
  firstWeekStart.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date(firstWeekStart);
  weekStart.setUTCDate(firstWeekStart.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

export function getOpinetWeekStart(value: Date): Date {
  const normalized = toUtcDateOnly(value);
  normalized.setUTCDate(normalized.getUTCDate() - normalized.getUTCDay());
  return normalized;
}

export function getOpinetWeekEnd(value: Date): Date {
  const weekStart = getOpinetWeekStart(value);
  weekStart.setUTCDate(weekStart.getUTCDate() + (OPINET_WEEKLY_COLLECTION_DAY_COUNT - 1));
  return weekStart;
}

function parseDateInput(value: Date | string, fieldName: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName} for Opinet display week.`);
  }

  return toUtcDateOnly(parsed);
}

export function getOpinetDisplayWeek(
  startDate: Date | string,
  endDate: Date | string,
): OpinetDisplayWeek {
  const weekStart = getOpinetWeekStart(parseDateInput(startDate, 'startDate'));
  const endWeekStart = getOpinetWeekStart(parseDateInput(endDate, 'endDate'));

  if (weekStart.getTime() !== endWeekStart.getTime()) {
    throw new Error('Opinet display week dates must belong to the same Sunday–Thursday week.');
  }

  const referenceWednesday = new Date(weekStart);
  referenceWednesday.setUTCDate(referenceWednesday.getUTCDate() + 3);

  const year = referenceWednesday.getUTCFullYear();
  const monthIndex = referenceWednesday.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const firstReferenceWednesday = getOpinetWeekStart(monthStart);
  firstReferenceWednesday.setUTCDate(firstReferenceWednesday.getUTCDate() + 3);

  if (firstReferenceWednesday.getUTCMonth() !== monthIndex) {
    firstReferenceWednesday.setUTCDate(firstReferenceWednesday.getUTCDate() + 7);
  }

  const weekOfMonth =
    Math.floor((referenceWednesday.getTime() - firstReferenceWednesday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return {
    year,
    month: monthIndex + 1,
    weekOfMonth,
  };
}

export function isOpinetWeeklyCollectionDay(value: Date): boolean {
  const dayOfWeek = value.getUTCDay();
  return dayOfWeek >= 0 && dayOfWeek <= 4;
}
