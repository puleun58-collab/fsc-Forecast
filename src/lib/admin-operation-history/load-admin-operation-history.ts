import { db } from '@/lib/db';

import {
  ADMIN_OPERATION_HISTORY_LIMIT,
  buildAdminOperationHistory,
  type AdminOperationEvent,
} from './admin-operation-history';

export async function loadAdminOperationHistory(
  limit = ADMIN_OPERATION_HISTORY_LIMIT,
): Promise<AdminOperationEvent[]> {
  const [ingestRuns, forecastRuns, fscResults] = await Promise.all([
    db.ingestRun.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        status: true,
        triggerKind: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    db.forecastRun.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        status: true,
        mapePct: true,
        metadata: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    db.fscResult.findMany({
      where: { scenarioName: 'base' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        targetYear: true,
        targetQuarter: true,
        diffRatio: true,
        oilWeightRate: true,
        quarterAverageKrwPerL: true,
        reliabilityGrade: true,
        reliabilitySampleCount: true,
        reliabilityMinimumSampleCount: true,
        recent13wWeeklyPriceMape: true,
        approvalStatus: true,
        approvedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return buildAdminOperationHistory({
    ingestRuns,
    forecastRuns: forecastRuns.map((run) => ({
      ...run,
      mapePct: run.mapePct === null ? null : run.mapePct.toString(),
    })),
    fscResults: fscResults.map((result) => ({
      ...result,
      diffRatio: result.diffRatio.toString(),
      oilWeightRate: result.oilWeightRate.toString(),
      quarterAverageKrwPerL: result.quarterAverageKrwPerL.toString(),
      recent13wWeeklyPriceMape:
        result.recent13wWeeklyPriceMape === null ? null : result.recent13wWeeklyPriceMape.toString(),
    })),
    limit,
  });
}
