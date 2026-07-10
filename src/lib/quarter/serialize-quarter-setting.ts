import type { QuarterSetting } from '@prisma/client';

export interface QuarterSettingDto {
  id: string;
  targetYear: number;
  targetQuarter: number;
  referenceYear: number;
  referenceQuarter: number;
  quarterStartDate: string;
  quarterEndDate: string;
  basePriceKrwPerL: string;
  appliedPriceKrwPerL: string;
  fscLowRate: string;
  fscHighRate: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serializeQuarterSetting(value: QuarterSetting): QuarterSettingDto {
  return {
    id: value.id,
    targetYear: value.targetYear,
    targetQuarter: value.targetQuarter,
    referenceYear: value.referenceYear,
    referenceQuarter: value.referenceQuarter,
    quarterStartDate: value.quarterStartDate.toISOString(),
    quarterEndDate: value.quarterEndDate.toISOString(),
    basePriceKrwPerL: value.basePriceKrwPerL.toFixed(3),
    appliedPriceKrwPerL: value.appliedPriceKrwPerL.toFixed(3),
    fscLowRate: value.fscLowRate.toFixed(4),
    fscHighRate: value.fscHighRate.toFixed(4),
    status: value.status,
    isActive: value.isActive,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
