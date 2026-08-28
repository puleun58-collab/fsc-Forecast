import { RunStatus } from '@prisma/client';

import { db } from '@/lib/db';
import { env } from '@/lib/env';

import { runFscResultRecompute } from './run-fsc-result-recompute';
import { isFscResultStaleForForecast } from './forecast-readiness';
import type { FscResultRecord } from './serialize-fsc-dto';

const FSC_RESULT_INCLUDE = {
  quarterSetting: true,
  sourceRecomputeSnapshot: {
    select: {
      currentTruthCutoffAt: true,
    },
  },
  forecastRun: {
    select: {
      completedAt: true,
    },
  },
  weeks: {
    orderBy: {
      sequenceNo: 'asc' as const,
    },
  },
};

async function readLatestBaseFscResult(
  targetYear: number,
  targetQuarter: number,
): Promise<FscResultRecord | null> {
  return db.fscResult.findFirst({
    where: {
      targetYear,
      targetQuarter,
      scenarioName: 'base',
      forecastRunId: {
        not: null,
      },
      weeks: {
        none: {
          forecastSourceKind: {
            in: ['monthly_point', 'carry_forward', 'applied_price_fallback', 'base_price_fallback'],
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: FSC_RESULT_INCLUDE,
  });
}

async function shouldRefreshActiveQuarterResult(
  targetYear: number,
  targetQuarter: number,
  latestResult: FscResultRecord | null,
): Promise<boolean> {
  const activeQuarter = await db.quarterSetting.findFirst({
    where: {
      targetYear,
      targetQuarter,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (activeQuarter === null) {
    return false;
  }

  const latestSnapshot = await db.recomputeSnapshot.findFirst({
    where: {
      datasetKey: env.datasetKey,
      status: RunStatus.succeeded,
      forecastRuns: {
        some: {
          status: RunStatus.succeeded,
          completedAt: {
            not: null,
          },
          points: {
            some: {},
          },
        },
      },
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      forecastRuns: {
        where: {
          status: RunStatus.succeeded,
          completedAt: {
            not: null,
          },
          points: {
            some: {},
          },
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          id: true,
        },
      },
    },
  });

  if (latestSnapshot === null) {
    return false;
  }

  if (latestResult === null) {
    return true;
  }

  const latestForecastRunId = latestSnapshot.forecastRuns[0]?.id;

  if (!latestForecastRunId) {
    return false;
  }

  return isFscResultStaleForForecast(latestResult, {
    recomputeSnapshotId: latestSnapshot.id,
    forecastRunId: latestForecastRunId,
  });
}

export async function findLatestBaseFscResultByQuarter(
  targetYear: number,
  targetQuarter: number,
): Promise<FscResultRecord | null> {
  let latestResult = await readLatestBaseFscResult(targetYear, targetQuarter);

  if (await shouldRefreshActiveQuarterResult(targetYear, targetQuarter, latestResult)) {
    try {
      await runFscResultRecompute();
      latestResult = await readLatestBaseFscResult(targetYear, targetQuarter);
    } catch (error) {
      console.error('Failed to refresh stale FSC result on read.', error);
    }
  }

  return latestResult;
}

export async function findFscResultById(resultId: string): Promise<FscResultRecord | null> {
  return db.fscResult.findUnique({
    where: {
      id: resultId,
    },
    include: FSC_RESULT_INCLUDE,
  });
}
