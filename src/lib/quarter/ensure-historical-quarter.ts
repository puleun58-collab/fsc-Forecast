import { QuarterStatus, type QuarterSetting } from '@prisma/client';

import { db } from '../db';
import { ensureActiveQuarter } from './ensure-active-quarter';
import { getQuarterDateRange } from './get-quarter-date-range';
import { toQuarterNumber } from './types';

export interface EnsureHistoricalQuarterInput {
  targetYear: number;
  targetQuarter: number;
}

function resolveReferenceQuarter(targetYear: number, targetQuarter: number): {
  referenceYear: number;
  referenceQuarter: number;
} {
  if (targetQuarter === 1) {
    return { referenceYear: targetYear - 1, referenceQuarter: 4 };
  }

  return { referenceYear: targetYear, referenceQuarter: targetQuarter - 1 };
}

export async function ensureHistoricalQuarterSetting(
  input: EnsureHistoricalQuarterInput,
): Promise<QuarterSetting> {
  const targetQuarter = toQuarterNumber(input.targetQuarter);
  const existing = await db.quarterSetting.findUnique({
    where: {
      targetYear_targetQuarter: {
        targetYear: input.targetYear,
        targetQuarter,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const activeQuarter = await ensureActiveQuarter();

  if (
    input.targetYear > activeQuarter.targetYear ||
    (input.targetYear === activeQuarter.targetYear && targetQuarter >= activeQuarter.targetQuarter)
  ) {
    throw new Error(
      `Historical quarter settings can only be created for quarters before the active quarter ${activeQuarter.targetYear}Q${activeQuarter.targetQuarter}.`,
    );
  }

  const range = getQuarterDateRange(input.targetYear, targetQuarter);
  const reference = resolveReferenceQuarter(input.targetYear, targetQuarter);

  return db.quarterSetting.create({
    data: {
      targetYear: input.targetYear,
      targetQuarter,
      referenceYear: reference.referenceYear,
      referenceQuarter: reference.referenceQuarter,
      quarterStartDate: range.startDate,
      quarterEndDate: range.endDate,
      basePriceKrwPerL: activeQuarter.basePriceKrwPerL,
      appliedPriceKrwPerL: activeQuarter.appliedPriceKrwPerL,
      fscLowRate: activeQuarter.fscLowRate,
      fscHighRate: activeQuarter.fscHighRate,
      status: QuarterStatus.closed,
      isActive: false,
      activeKey: null,
    },
  });
}
