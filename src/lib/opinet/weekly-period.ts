export const OPINET_WEEKLY_COLLECTION_DAY_COUNT = 5;

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

export function isOpinetWeeklyCollectionDay(value: Date): boolean {
  const dayOfWeek = value.getUTCDay();
  return dayOfWeek >= 0 && dayOfWeek <= 4;
}
