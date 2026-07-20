import { db } from '../db';
import type { ExternalIndicatorCode } from './types';

export type IndicatorRefreshStatus = 'checking' | 'succeeded' | 'failed';

export interface IndicatorSyncStateRecord {
  indicatorCode: ExternalIndicatorCode;
  providerKey: string;
  status: IndicatorRefreshStatus;
  lastAttemptAt: Date;
  lastSuccessAt: Date | null;
  latestObservedAt: Date | null;
  errorSummary: string | null;
}

const MAX_ERROR_SUMMARY_LENGTH = 1_000;

export async function markIndicatorSyncChecking(input: {
  indicatorCode: ExternalIndicatorCode;
  providerKey: string;
  attemptedAt: Date;
}): Promise<void> {
  await db.externalIndicatorSyncState.upsert({
    where: { indicatorCode: input.indicatorCode },
    create: {
      indicatorCode: input.indicatorCode,
      providerKey: input.providerKey,
      status: 'checking',
      lastAttemptAt: input.attemptedAt,
    },
    update: {
      providerKey: input.providerKey,
      status: 'checking',
      lastAttemptAt: input.attemptedAt,
      errorSummary: null,
    },
  });
}

export async function markIndicatorSyncSucceeded(input: {
  indicatorCode: ExternalIndicatorCode;
  providerKey: string;
  attemptedAt: Date;
  latestObservedAt: Date | null;
}): Promise<void> {
  await db.externalIndicatorSyncState.upsert({
    where: { indicatorCode: input.indicatorCode },
    create: {
      indicatorCode: input.indicatorCode,
      providerKey: input.providerKey,
      status: 'succeeded',
      lastAttemptAt: input.attemptedAt,
      lastSuccessAt: input.attemptedAt,
      latestObservedAt: input.latestObservedAt,
    },
    update: {
      providerKey: input.providerKey,
      status: 'succeeded',
      lastAttemptAt: input.attemptedAt,
      lastSuccessAt: input.attemptedAt,
      latestObservedAt: input.latestObservedAt,
      errorSummary: null,
    },
  });
}

export async function markIndicatorSyncFailed(input: {
  indicatorCode: ExternalIndicatorCode;
  providerKey: string;
  attemptedAt: Date;
  error: unknown;
}): Promise<void> {
  const errorSummary = (input.error instanceof Error ? input.error.message : String(input.error)).slice(
    0,
    MAX_ERROR_SUMMARY_LENGTH,
  );

  await db.externalIndicatorSyncState.upsert({
    where: { indicatorCode: input.indicatorCode },
    create: {
      indicatorCode: input.indicatorCode,
      providerKey: input.providerKey,
      status: 'failed',
      lastAttemptAt: input.attemptedAt,
      errorSummary,
    },
    update: {
      providerKey: input.providerKey,
      status: 'failed',
      lastAttemptAt: input.attemptedAt,
      errorSummary,
    },
  });
}

export async function loadIndicatorSyncStates(
  indicatorCodes: readonly ExternalIndicatorCode[],
): Promise<IndicatorSyncStateRecord[]> {
  const rows = await db.externalIndicatorSyncState.findMany({
    where: { indicatorCode: { in: [...indicatorCodes] } },
  });

  return rows.flatMap((row): IndicatorSyncStateRecord[] => {
    if (row.status !== 'checking' && row.status !== 'succeeded' && row.status !== 'failed') {
      return [];
    }

    return [
      {
        indicatorCode: row.indicatorCode as ExternalIndicatorCode,
        providerKey: row.providerKey,
        status: row.status,
        lastAttemptAt: row.lastAttemptAt,
        lastSuccessAt: row.lastSuccessAt,
        latestObservedAt: row.latestObservedAt,
        errorSummary: row.errorSummary,
      },
    ];
  });
}
