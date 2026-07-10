import { Prisma } from '@prisma/client';

import {
  FSC_EXCEL_REGRESSION_FIXTURE,
  type CalculateFscResultInput,
  type CalculateFscResultOutput,
  type DecimalLike,
} from './types';

const ROUND_HALF_UP = Prisma.Decimal.ROUND_HALF_UP;
const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

function toDecimal(value: DecimalLike, fieldName: string): Prisma.Decimal {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new Error(`${fieldName} must be a valid decimal value.`);
  }
}

function roundPrice(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(3, ROUND_HALF_UP);
}

function roundRate(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(4, ROUND_HALF_UP);
}

function roundRatio(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(6, ROUND_HALF_UP);
}

function assertPositive(value: Prisma.Decimal, fieldName: string): void {
  if (!value.isFinite() || value.lte(ZERO)) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
}

function assertRate(value: Prisma.Decimal, fieldName: string): void {
  if (!value.isFinite() || value.lt(ZERO) || value.gt(ONE)) {
    throw new Error(`${fieldName} must be between 0 and 1.`);
  }
}

export function calculateFscResult(input: CalculateFscResultInput): CalculateFscResultOutput {
  const basePriceKrwPerL = roundPrice(toDecimal(input.basePriceKrwPerL, 'basePriceKrwPerL'));
  const appliedPriceKrwPerL = roundPrice(toDecimal(input.appliedPriceKrwPerL, 'appliedPriceKrwPerL'));
  const quarterAverageKrwPerL = roundPrice(toDecimal(input.quarterAverageKrwPerL, 'quarterAverageKrwPerL'));
  const fscLowRate = roundRate(toDecimal(input.fscLowRate, 'fscLowRate'));
  const fscHighRate = roundRate(toDecimal(input.fscHighRate, 'fscHighRate'));

  assertPositive(basePriceKrwPerL, 'basePriceKrwPerL');
  assertPositive(quarterAverageKrwPerL, 'quarterAverageKrwPerL');
  assertRate(fscLowRate, 'fscLowRate');
  assertRate(fscHighRate, 'fscHighRate');

  if (fscLowRate.gt(fscHighRate)) {
    throw new Error('fscLowRate must be less than or equal to fscHighRate.');
  }

  const priceDiffKrwPerL = roundPrice(quarterAverageKrwPerL.minus(basePriceKrwPerL));
  const diffRatio = roundRatio(priceDiffKrwPerL.dividedBy(basePriceKrwPerL));
  const fscLowKrwPerL = roundPrice(
    quarterAverageKrwPerL.mul(diffRatio.mul(fscLowRate).plus(ONE)),
  );
  const fscHighKrwPerL = roundPrice(
    quarterAverageKrwPerL.mul(diffRatio.mul(fscHighRate).plus(ONE)),
  );

  return {
    calculationFormulaVersion: 'fsc-v1',
    basePriceKrwPerL,
    appliedPriceKrwPerL,
    quarterAverageKrwPerL,
    priceDiffKrwPerL,
    diffRatio,
    fscLowRate,
    fscHighRate,
    fscLowKrwPerL,
    fscHighKrwPerL,
  };
}

export function verifyFscExcelRegressionFixture(): boolean {
  const result = calculateFscResult(FSC_EXCEL_REGRESSION_FIXTURE.input);

  return (
    result.priceDiffKrwPerL.toFixed(3) === FSC_EXCEL_REGRESSION_FIXTURE.expected.priceDiffKrwPerL &&
    result.diffRatio.toFixed(6) === FSC_EXCEL_REGRESSION_FIXTURE.expected.diffRatio &&
    result.fscLowKrwPerL.toFixed(3) === FSC_EXCEL_REGRESSION_FIXTURE.expected.fscLowKrwPerL &&
    result.fscHighKrwPerL.toFixed(3) === FSC_EXCEL_REGRESSION_FIXTURE.expected.fscHighKrwPerL
  );
}
