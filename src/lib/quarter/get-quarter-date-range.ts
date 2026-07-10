import { toQuarterNumber } from './types';

export function getQuarterDateRange(year: number, quarter: number): {
  startDate: Date;
  endDate: Date;
} {
  const normalizedQuarter = toQuarterNumber(quarter);
  const startMonthIndex = (normalizedQuarter - 1) * 3;
  const endMonthIndex = startMonthIndex + 2;

  return {
    startDate: new Date(Date.UTC(year, startMonthIndex, 1)),
    endDate: new Date(Date.UTC(year, endMonthIndex + 1, 0)),
  };
}
