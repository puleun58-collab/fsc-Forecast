import { Prisma, QuarterStatus, type QuarterSetting } from '@prisma/client';

import { db } from '../db';
import { getQuarterDateRange } from './get-quarter-date-range';
import { activateQuarter } from './activate-quarter';
import { rolloverActiveQuarter } from './rollover-active-quarter';

const INITIAL_TARGET_YEAR = 2026;
const INITIAL_TARGET_QUARTER = 3;
const INITIAL_REFERENCE_YEAR = 2026;
const INITIAL_REFERENCE_QUARTER = 2;
const ACTIVE_QUARTER_LOCK_CLASS_ID = 17061;
const ACTIVE_QUARTER_LOCK_OBJECT_ID = 904;

function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

async function createInitialActiveQuarter(tx: Prisma.TransactionClient): Promise<QuarterSetting> {
  const range = getQuarterDateRange(INITIAL_TARGET_YEAR, INITIAL_TARGET_QUARTER);

  return tx.quarterSetting.create({
    data: {
      targetYear: INITIAL_TARGET_YEAR,
      targetQuarter: INITIAL_TARGET_QUARTER,
      referenceYear: INITIAL_REFERENCE_YEAR,
      referenceQuarter: INITIAL_REFERENCE_QUARTER,
      quarterStartDate: range.startDate,
      quarterEndDate: range.endDate,
      basePriceKrwPerL: toDecimal('1500.000'),
      appliedPriceKrwPerL: toDecimal('1500.000'),
      fscLowRate: toDecimal('0.3000'),
      fscHighRate: toDecimal('0.7000'),
      status: QuarterStatus.active,
      isActive: true,
      activeKey: 'ACTIVE',
    },
  });
}

export async function ensureActiveQuarter(today: Date = new Date()): Promise<QuarterSetting> {
  const todayDate = toUtcDateOnly(today);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${ACTIVE_QUARTER_LOCK_CLASS_ID} AS integer), CAST(${ACTIVE_QUARTER_LOCK_OBJECT_ID} AS integer))`;

    const activeQuarter = await tx.quarterSetting.findUnique({
      where: {
        activeKey: 'ACTIVE',
      },
    });

    if (activeQuarter && todayDate.getTime() <= activeQuarter.quarterEndDate.getTime()) {
      return activeQuarter;
    }

    if (activeQuarter) {
      return rolloverActiveQuarter(tx, activeQuarter, todayDate);
    }

    const quarterCount = await tx.quarterSetting.count();

    if (quarterCount === 0) {
      return createInitialActiveQuarter(tx);
    }

    const latestQuarter = await tx.quarterSetting.findFirst({
      orderBy: [{ targetYear: 'desc' }, { targetQuarter: 'desc' }],
    });

    if (!latestQuarter) {
      return createInitialActiveQuarter(tx);
    }

    const activatedQuarter = await activateQuarter(tx, latestQuarter.id);

    if (todayDate.getTime() <= activatedQuarter.quarterEndDate.getTime()) {
      return activatedQuarter;
    }

    return rolloverActiveQuarter(tx, activatedQuarter, todayDate);
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });
}
