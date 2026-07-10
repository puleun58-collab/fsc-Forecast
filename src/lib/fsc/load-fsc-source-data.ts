import { RunStatus, type Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { env } from '@/lib/env';

import type { FscSourceDailyPriceRow, FscSourceForecastRunRecord, LoadFscSourceDataResult } from './types';

function toForecastRunRecord(run: {
  id: string;
  mapePct: Prisma.Decimal | null;
  maeKrwPerL: Prisma.Decimal | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  completedAt: Date | null;
  points: Array<{
    id: string;
    horizonKind: 'weekly' | 'monthly';
    horizonIndex: number;
    targetDate: Date;
    pointKrwPerL: Prisma.Decimal;
  }>;
}): FscSourceForecastRunRecord {
  return {
    id: run.id,
    forecastModelVersion: null,
    mapePct: run.mapePct,
    maeKrwPerL: run.maeKrwPerL,
    metadata: run.metadata,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    points: run.points.map((point) => ({
      id: point.id,
      horizonKind: point.horizonKind,
      horizonIndex: point.horizonIndex,
      targetDate: point.targetDate,
      pointKrwPerL: point.pointKrwPerL,
    })),
  };
}

function toDailyPriceRow(row: {
  priceDate: Date;
  currentRevisionId: string;
  currentRevision: { observedPriceKrwPerL: Prisma.Decimal };
}): FscSourceDailyPriceRow {
  return {
    priceDate: row.priceDate,
    currentRevisionId: row.currentRevisionId,
    observedPriceKrwPerL: row.currentRevision.observedPriceKrwPerL,
  };
}

export async function loadFscSourceData(
  tx: Prisma.TransactionClient = db,
): Promise<LoadFscSourceDataResult> {
  const recomputeSnapshot = await tx.recomputeSnapshot.findFirst({
    where: {
      datasetKey: env.datasetKey,
      status: RunStatus.succeeded,
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      datasetKey: true,
      currentTruthCutoffAt: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (recomputeSnapshot === null) {
    throw new Error('No succeeded recompute snapshot is available for FSC recomputation.');
  }

  const forecastRun = await tx.forecastRun.findFirst({
    where: {
      recomputeSnapshotId: recomputeSnapshot.id,
      status: RunStatus.succeeded,
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      mapePct: true,
      maeKrwPerL: true,
      metadata: true,
      createdAt: true,
      completedAt: true,
      points: {
        orderBy: [{ targetDate: 'asc' }, { horizonKind: 'asc' }, { horizonIndex: 'asc' }],
        select: {
          id: true,
          horizonKind: true,
          horizonIndex: true,
          targetDate: true,
          pointKrwPerL: true,
        },
      },
    },
  });

  const dailyPrices = await tx.dailyPriceCurrent.findMany({
    where: {
      datasetKey: env.datasetKey,
      latestRecomputeSnapshotId: recomputeSnapshot.id,
    },
    orderBy: {
      priceDate: 'asc',
    },
    select: {
      priceDate: true,
      currentRevisionId: true,
      currentRevision: {
        select: {
          observedPriceKrwPerL: true,
        },
      },
    },
  });

  return {
    recomputeSnapshot,
    forecastRun: forecastRun === null ? null : toForecastRunRecord(forecastRun),
    dailyPrices: dailyPrices.map(toDailyPriceRow),
  };
}
