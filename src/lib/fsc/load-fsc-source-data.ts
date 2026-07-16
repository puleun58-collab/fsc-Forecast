import { Prisma, RunStatus, type Prisma as PrismaTypes } from '@prisma/client';

import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { readMonthlySeries } from '@/lib/opinet/save-monthly-series';
import { readWeeklySeries } from '@/lib/opinet/save-weekly-series';

import type {
  FscSourceDailyPriceRow,
  FscSourceForecastRunRecord,
  FscSourceOfficialMonthlyPriceRow,
  FscSourceOfficialWeeklyPriceRow,
  LoadFscSourceDataResult,
} from './types';

function toForecastRunRecord(run: {
  id: string;
  mapePct: Prisma.Decimal | null;
  maeKrwPerL: Prisma.Decimal | null;
  metadata: PrismaTypes.JsonValue | null;
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

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function filterDailyPricesByCutoffDate(
  dailyPrices: readonly FscSourceDailyPriceRow[],
  currentTruthCutoffAt: Date | null,
): FscSourceDailyPriceRow[] {
  if (currentTruthCutoffAt === null) {
    return [...dailyPrices];
  }

  const cutoffDate = toDateOnly(currentTruthCutoffAt);
  return dailyPrices.filter((row) => toDateOnly(row.priceDate).getTime() <= cutoffDate.getTime());
}

function toOfficialWeeklyPriceRow(row: {
  weekKey: string;
  weekLabel: string;
  weekStartDate: string;
  weekEndDate: string;
  price: number;
  fetchedAt: string;
}): FscSourceOfficialWeeklyPriceRow {
  return {
    weekKey: row.weekKey,
    weekLabel: row.weekLabel,
    weekStartDate: new Date(`${row.weekStartDate}T00:00:00.000Z`),
    weekEndDate: new Date(`${row.weekEndDate}T00:00:00.000Z`),
    priceKrwPerL: new Prisma.Decimal(row.price),
    fetchedAt: new Date(row.fetchedAt),
  };
}

function toOfficialMonthlyPriceRow(row: {
  monthKey: string;
  monthLabel: string;
  monthStartDate: string;
  monthEndDate: string;
  price: number;
  fetchedAt: string;
}): FscSourceOfficialMonthlyPriceRow {
  return {
    monthKey: row.monthKey,
    monthLabel: row.monthLabel,
    monthStartDate: new Date(`${row.monthStartDate}T00:00:00.000Z`),
    monthEndDate: new Date(`${row.monthEndDate}T00:00:00.000Z`),
    priceKrwPerL: new Prisma.Decimal(row.price),
    fetchedAt: new Date(row.fetchedAt),
  };
}

export async function loadFscSourceData(
  tx: PrismaTypes.TransactionClient = db,
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

  const [dailyPrices, officialWeeklyPrices, officialMonthlyPrices] = await Promise.all([
    tx.dailyPriceCurrent.findMany({
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
    }),
    readWeeklySeries(),
    readMonthlySeries(),
  ]);

  const normalizedDailyPrices = filterDailyPricesByCutoffDate(
    dailyPrices.map(toDailyPriceRow),
    recomputeSnapshot.currentTruthCutoffAt,
  );

  return {
    recomputeSnapshot,
    forecastRun: forecastRun === null ? null : toForecastRunRecord(forecastRun),
    dailyPrices: normalizedDailyPrices,
    officialWeeklyPrices: officialWeeklyPrices.map(toOfficialWeeklyPriceRow),
    officialMonthlyPrices: officialMonthlyPrices.map(toOfficialMonthlyPriceRow),
  };
}
