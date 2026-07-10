import { Prisma, QuarterStatus, type QuarterSetting } from '@prisma/client';

import { getNextQuarter } from './get-next-quarter';
import { getPreviousQuarter } from './get-previous-quarter';
import { getQuarterDateRange } from './get-quarter-date-range';
import { activateQuarter } from './activate-quarter';

function toDecimal(value: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

async function createNextQuarterFromPrevious(
  tx: Prisma.TransactionClient,
  previousQuarter: QuarterSetting,
): Promise<QuarterSetting> {
  const nextQuarter = getNextQuarter(previousQuarter.targetYear, previousQuarter.targetQuarter);
  const referenceQuarter = getPreviousQuarter(nextQuarter.year, nextQuarter.quarter);
  const range = getQuarterDateRange(nextQuarter.year, nextQuarter.quarter);

  return tx.quarterSetting.create({
    data: {
      targetYear: nextQuarter.year,
      targetQuarter: nextQuarter.quarter,
      referenceYear: referenceQuarter.year,
      referenceQuarter: referenceQuarter.quarter,
      quarterStartDate: range.startDate,
      quarterEndDate: range.endDate,
      basePriceKrwPerL: toDecimal(previousQuarter.basePriceKrwPerL),
      appliedPriceKrwPerL: toDecimal(previousQuarter.appliedPriceKrwPerL),
      fscLowRate: toDecimal(previousQuarter.fscLowRate),
      fscHighRate: toDecimal(previousQuarter.fscHighRate),
      status: QuarterStatus.draft,
      isActive: false,
      activeKey: null,
    },
  });
}

async function findOrCreateNextQuarter(
  tx: Prisma.TransactionClient,
  previousQuarter: QuarterSetting,
): Promise<QuarterSetting> {
  const nextQuarter = getNextQuarter(previousQuarter.targetYear, previousQuarter.targetQuarter);
  const existingQuarter = await tx.quarterSetting.findUnique({
    where: {
      targetYear_targetQuarter: {
        targetYear: nextQuarter.year,
        targetQuarter: nextQuarter.quarter,
      },
    },
  });

  if (existingQuarter) {
    return existingQuarter;
  }

  return createNextQuarterFromPrevious(tx, previousQuarter);
}

export async function rolloverActiveQuarter(
  tx: Prisma.TransactionClient,
  activeQuarter: QuarterSetting,
  todayDate: Date,
): Promise<QuarterSetting> {
  let currentQuarter = activeQuarter;

  while (todayDate.getTime() > currentQuarter.quarterEndDate.getTime()) {
    await tx.quarterSetting.update({
      where: {
        id: currentQuarter.id,
      },
      data: {
        status: QuarterStatus.closed,
        isActive: false,
        activeKey: null,
      },
    });

    const nextQuarter = await findOrCreateNextQuarter(tx, currentQuarter);
    currentQuarter = await activateQuarter(tx, nextQuarter.id);
  }

  return currentQuarter;
}
