import { db } from '@/lib/db';

import type { FscResultRecord } from './serialize-fsc-dto';

const FSC_RESULT_INCLUDE = {
  quarterSetting: true,
  weeks: {
    orderBy: {
      sequenceNo: 'asc' as const,
    },
  },
};

export async function findLatestBaseFscResultByQuarter(
  targetYear: number,
  targetQuarter: number,
): Promise<FscResultRecord | null> {
  return db.fscResult.findFirst({
    where: {
      targetYear,
      targetQuarter,
      scenarioName: 'base',
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: FSC_RESULT_INCLUDE,
  });
}

export async function findFscResultById(resultId: string): Promise<FscResultRecord | null> {
  return db.fscResult.findUnique({
    where: {
      id: resultId,
    },
    include: FSC_RESULT_INCLUDE,
  });
}
