import { db } from '@/lib/db';

import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselQuarterlyPriceRow,
} from './types';

const DATASET_KEY = 'national-average-opinet-diesel';

type PublishedSeriesInput = {
  monthlyEntries: readonly NormalizedDieselMonthlyPriceRow[];
  quarterlyEntries: readonly NormalizedDieselQuarterlyPriceRow[];
};

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function persistOpinetPublishedPrices(input: PublishedSeriesInput): Promise<void> {
  const monthlyWrites = input.monthlyEntries.map((row) => db.opinetPublishedPrice.upsert({
    where: {
      datasetKey_periodKind_periodKey: {
        datasetKey: DATASET_KEY,
        periodKind: 'monthly',
        periodKey: row.monthKey,
      },
    },
    create: {
      datasetKey: DATASET_KEY,
      periodKind: 'monthly',
      periodKey: row.monthKey,
      periodLabel: row.monthLabel,
      periodStartDate: parseDateOnly(row.monthStartDate),
      periodEndDate: parseDateOnly(row.monthEndDate),
      productCode: row.productCode,
      productName: row.productName,
      priceKrwPerL: row.price,
      source: row.source,
      sourceFetchedAt: new Date(row.fetchedAt),
    },
    update: {
      periodLabel: row.monthLabel,
      periodStartDate: parseDateOnly(row.monthStartDate),
      periodEndDate: parseDateOnly(row.monthEndDate),
      productCode: row.productCode,
      productName: row.productName,
      priceKrwPerL: row.price,
      source: row.source,
      sourceFetchedAt: new Date(row.fetchedAt),
    },
  }));
  const quarterlyWrites = input.quarterlyEntries.map((row) => db.opinetPublishedPrice.upsert({
    where: {
      datasetKey_periodKind_periodKey: {
        datasetKey: DATASET_KEY,
        periodKind: 'quarterly',
        periodKey: row.quarterKey,
      },
    },
    create: {
      datasetKey: DATASET_KEY,
      periodKind: 'quarterly',
      periodKey: row.quarterKey,
      periodLabel: row.quarterLabel,
      periodStartDate: parseDateOnly(row.quarterStartDate),
      periodEndDate: parseDateOnly(row.quarterEndDate),
      productCode: row.productCode,
      productName: row.productName,
      priceKrwPerL: row.price,
      source: row.source,
      sourceFetchedAt: new Date(row.fetchedAt),
    },
    update: {
      periodLabel: row.quarterLabel,
      periodStartDate: parseDateOnly(row.quarterStartDate),
      periodEndDate: parseDateOnly(row.quarterEndDate),
      productCode: row.productCode,
      productName: row.productName,
      priceKrwPerL: row.price,
      source: row.source,
      sourceFetchedAt: new Date(row.fetchedAt),
    },
  }));

  await db.$transaction([...monthlyWrites, ...quarterlyWrites]);
}

export async function readPersistedMonthlySeries(): Promise<NormalizedDieselMonthlyPriceRow[]> {
  const rows = await db.opinetPublishedPrice.findMany({
    where: { datasetKey: DATASET_KEY, periodKind: 'monthly' },
    orderBy: { periodStartDate: 'asc' },
  });

  return rows.map((row) => ({
    monthKey: row.periodKey,
    monthLabel: row.periodLabel,
    monthStartDate: row.periodStartDate.toISOString().slice(0, 10),
    monthEndDate: row.periodEndDate.toISOString().slice(0, 10),
    productCode: row.productCode,
    productName: row.productName,
    price: Number(row.priceKrwPerL),
    source: row.source,
    fetchedAt: row.sourceFetchedAt.toISOString(),
  }));
}

export async function readPersistedQuarterlySeries(): Promise<NormalizedDieselQuarterlyPriceRow[]> {
  const rows = await db.opinetPublishedPrice.findMany({
    where: { datasetKey: DATASET_KEY, periodKind: 'quarterly' },
    orderBy: { periodStartDate: 'asc' },
  });

  return rows.map((row) => ({
    quarterKey: row.periodKey,
    quarterLabel: row.periodLabel,
    quarterStartDate: row.periodStartDate.toISOString().slice(0, 10),
    quarterEndDate: row.periodEndDate.toISOString().slice(0, 10),
    productCode: row.productCode,
    productName: row.productName,
    price: Number(row.priceKrwPerL),
    source: row.source,
    fetchedAt: row.sourceFetchedAt.toISOString(),
  }));
}
