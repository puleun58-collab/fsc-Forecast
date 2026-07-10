export type QuarterNumber = 1 | 2 | 3 | 4;

export type YearQuarter = {
  year: number;
  quarter: QuarterNumber;
};

export function assertQuarterNumber(quarter: number): asserts quarter is QuarterNumber {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error(`Quarter must be an integer between 1 and 4. Received '${quarter}'.`);
  }
}

export function toQuarterNumber(quarter: number): QuarterNumber {
  assertQuarterNumber(quarter);
  return quarter;
}
