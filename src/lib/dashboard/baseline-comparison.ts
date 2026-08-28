import type { DashboardTrendDirection } from './fsc-types';

export type BaselineComparisonResult = {
  amountKrwPerL: number;
  ratio: number;
  direction: DashboardTrendDirection;
};

export function calculateBaselineComparison(
  priceKrwPerL: number | string | null,
  basePriceKrwPerL: number | string | null,
): BaselineComparisonResult | null {
  const price = Number(priceKrwPerL);
  const basePrice = Number(basePriceKrwPerL);

  if (!Number.isFinite(price) || !Number.isFinite(basePrice) || price <= 0 || basePrice <= 0) {
    return null;
  }

  const amountKrwPerL = price - basePrice;

  return {
    amountKrwPerL,
    ratio: amountKrwPerL / basePrice,
    direction: amountKrwPerL > 0 ? 'up' : amountKrwPerL < 0 ? 'down' : 'flat',
  };
}
