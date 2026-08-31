import { Prisma, RunStatus, type Prisma as PrismaTypes } from '@prisma/client';

import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { fetchPublishedOpinetMonthlyDieselPrices } from '@/lib/opinet/fetch-monthly-price';
import { fetchPublishedOpinetWeeklyDieselPrices } from '@/lib/opinet/fetch-weekly-price';
import { loadPublicConfirmedLatestDate } from '@/lib/opinet/resolve-public-confirmed-date';
import { readQuarterlySeries } from '@/lib/opinet/save-quarterly-series';
import { readPersistedQuarterlySeries } from '@/lib/opinet/published-price-store';

import type {
  FscSourceDailyPriceRow,
  FscSourceForecastRunRecord,
  FscSourceOfficialMonthlyPriceRow,
  FscSourceOfficialWeeklyPriceRow,
  LoadFscSourceDataResult,
  FscSourceOfficialQuarterlyPriceRow,
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
    lowerBoundKrwPerL: Prisma.Decimal | null;
    upperBoundKrwPerL: Prisma.Decimal | null;
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
      lowerBoundKrwPerL: point.lowerBoundKrwPerL,
      upperBoundKrwPerL: point.upperBoundKrwPerL,
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

function filterDailyPricesByConfirmedDate(
  dailyPrices: readonly FscSourceDailyPriceRow[],
  latestConfirmedDate: Date | null,
): FscSourceDailyPriceRow[] {
  if (latestConfirmedDate === null) {
    return [...dailyPrices];
  }

  return dailyPrices.filter((row) => toDateOnly(row.priceDate).getTime() <= latestConfirmedDate.getTime());
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

function toOfficialQuarterlyPriceRow(row: {
  quarterKey: string;
  quarterLabel: string;
  quarterStartDate: string;
  quarterEndDate: string;
  price: number;
  fetchedAt: string;
}): FscSourceOfficialQuarterlyPriceRow {
  return {
    quarterKey: row.quarterKey,
    quarterLabel: row.quarterLabel,
    quarterStartDate: new Date(`${row.quarterStartDate}T00:00:00.000Z`),
    quarterEndDate: new Date(`${row.quarterEndDate}T00:00:00.000Z`),
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
      datasetKey: true,
      currentTruthCutoffAt: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (recomputeSnapshot === null) {
    throw new Error('No forecast-ready recompute snapshot is available for FSC recomputation.');
  }

  const [
    forecastRun,
    dailyPrices,
    officialWeeklyPrices,
    officialMonthlyPrices,
    fileQuarterlyPrices,
    persistedQuarterlyPrices,
    latestConfirmedDate,
  ] = await Promise.all([
    tx.forecastRun.findFirst({
      where: {
        recomputeSnapshotId: recomputeSnapshot.id,
        status: RunStatus.succeeded,
        completedAt: {
          not: null,
        },
        points: {
          some: {},
        },
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
            lowerBoundKrwPerL: true,
            upperBoundKrwPerL: true,
          },
        },
      },
    }),
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
    fetchPublishedOpinetWeeklyDieselPrices(),
    fetchPublishedOpinetMonthlyDieselPrices(),
    readQuarterlySeries(),
    readPersistedQuarterlySeries(),
    loadPublicConfirmedLatestDate(tx, {
      datasetKey: env.datasetKey,
      observedBeforeOrAt: recomputeSnapshot.currentTruthCutoffAt,
    }),
  ]);
  const normalizedDailyPrices = filterDailyPricesByConfirmedDate(
    dailyPrices.map(toDailyPriceRow),
    latestConfirmedDate,
  );
  const officialQuarterlyPrices = Array.from(
    new Map(
      [...fileQuarterlyPrices, ...persistedQuarterlyPrices].map((row) => [row.quarterKey, row]),
    ).values(),
  ).sort((left, right) => left.quarterKey.localeCompare(right.quarterKey));

  if (forecastRun === null) {
    throw new Error(
      `Forecast-ready snapshot '${recomputeSnapshot.id}' no longer has a completed forecast run.`,
    );
  }

  return {
    recomputeSnapshot,
    forecastRun: toForecastRunRecord(forecastRun),
    dailyPrices: normalizedDailyPrices,
    officialWeeklyPrices: officialWeeklyPrices.map(toOfficialWeeklyPriceRow),
    officialMonthlyPrices: officialMonthlyPrices.map(toOfficialMonthlyPriceRow),
    officialQuarterlyPrices: officialQuarterlyPrices.map(toOfficialQuarterlyPriceRow),
  };
}
