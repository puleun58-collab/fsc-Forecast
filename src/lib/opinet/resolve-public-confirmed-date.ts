import type { Prisma } from '@prisma/client';

import { OPINET_DAILY_AVERAGE_PRICE_SOURCE, OPINET_DAILY_RECENT_PRICE_SOURCE } from './normalize-diesel';

type PriceRevisionLogReader = Pick<Prisma.TransactionClient, 'priceRevisionLog'>;

type OpinetRevisionSourceRow = {
  priceDate: Date;
  sourcePayload: unknown;
};

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function maxDate(left: Date | null, right: Date): Date {
  if (left === null) {
    return right;
  }

  return left.getTime() >= right.getTime() ? left : right;
}

export function readOpinetRowSource(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = (payload as { source?: unknown }).source;
  return typeof candidate === 'string' ? candidate : null;
}

export function resolvePublicConfirmedLatestDateFromRows(
  rows: readonly OpinetRevisionSourceRow[],
): Date | null {
  let latestAverageDate: Date | null = null;
  let latestRecentDate: Date | null = null;

  for (const row of rows) {
    const source = readOpinetRowSource(row.sourcePayload);
    const priceDate = toDateOnly(row.priceDate);

    if (source === OPINET_DAILY_AVERAGE_PRICE_SOURCE) {
      latestAverageDate = maxDate(latestAverageDate, priceDate);
      continue;
    }

    if (source === OPINET_DAILY_RECENT_PRICE_SOURCE) {
      latestRecentDate = maxDate(latestRecentDate, priceDate);
    }
  }

  if (latestAverageDate !== null && latestRecentDate !== null) {
    return latestAverageDate.getTime() <= latestRecentDate.getTime()
      ? latestAverageDate
      : latestRecentDate;
  }

  return latestAverageDate ?? latestRecentDate;
}

export async function loadPublicConfirmedLatestDate(
  tx: PriceRevisionLogReader,
  input: {
    datasetKey: string;
    observedBeforeOrAt?: Date | null;
  },
): Promise<Date | null> {
  const rows = await tx.priceRevisionLog.findMany({
    where: {
      datasetKey: input.datasetKey,
      createdAt: input.observedBeforeOrAt
        ? {
            lte: input.observedBeforeOrAt,
          }
        : undefined,
    },
    orderBy: [{ priceDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      priceDate: true,
      sourcePayload: true,
    },
  });

  return resolvePublicConfirmedLatestDateFromRows(rows);
}
