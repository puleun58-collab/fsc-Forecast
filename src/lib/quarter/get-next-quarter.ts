import type { YearQuarter } from './types';
import { toQuarterNumber } from './types';

export function getNextQuarter(year: number, quarter: number): YearQuarter {
  const normalizedQuarter = toQuarterNumber(quarter);

  if (normalizedQuarter === 4) {
    return {
      year: year + 1,
      quarter: 1,
    };
  }

  return {
    year,
    quarter: toQuarterNumber(normalizedQuarter + 1),
  };
}
