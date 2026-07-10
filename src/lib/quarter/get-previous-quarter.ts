import type { YearQuarter } from './types';
import { toQuarterNumber } from './types';

export function getPreviousQuarter(year: number, quarter: number): YearQuarter {
  const normalizedQuarter = toQuarterNumber(quarter);

  if (normalizedQuarter === 1) {
    return {
      year: year - 1,
      quarter: 4,
    };
  }

  return {
    year,
    quarter: toQuarterNumber(normalizedQuarter - 1),
  };
}
