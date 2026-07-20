import { externalIndicatorCodes } from './catalog';
import { fredIndicatorProvider } from './fred-provider';
import {
  markIndicatorSyncChecking,
  markIndicatorSyncFailed,
  markIndicatorSyncSucceeded,
} from './indicator-sync-state';
import { loadLatestIndicatorStates } from './latest-indicator-states';
import { opinetDubaiProvider } from './opinet-dubai-provider';
import { runIndicatorSync } from './run-indicator-sync';
import type { ExternalIndicatorProvider, ExternalIndicatorProviderResult } from './provider-contract';
import type {
  ExternalIndicatorCode,
  IndicatorBatchSyncResult,
  IndicatorSyncResult,
  IndicatorSyncStatus,
} from './types';

interface SyncStateWriter {
  checking: typeof markIndicatorSyncChecking;
  succeeded: typeof markIndicatorSyncSucceeded;
  failed: typeof markIndicatorSyncFailed;
}

interface SyncExternalIndicatorsDeps {
  provider?: ExternalIndicatorProvider;
  providers?: readonly ExternalIndicatorProvider[];
  runSync: typeof runIndicatorSync;
  loadLatestStates: typeof loadLatestIndicatorStates;
  stateWriter: SyncStateWriter;
}

export interface SyncExternalIndicatorsInput {
  indicatorCodes?: readonly ExternalIndicatorCode[];
  observedAtOrAfter?: Date;
  observedAtOrBefore?: Date;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  deps?: Partial<SyncExternalIndicatorsDeps>;
}

function filterPointsForPersistence(
  providerResult: ExternalIndicatorProviderResult,
  latestStates: Awaited<ReturnType<typeof loadLatestIndicatorStates>>,
): ExternalIndicatorProviderResult {
  const latestObservedAtByCode = new Map(
    latestStates.map((state) => [state.indicatorCode, state.observedAt.getTime()]),
  );
  const latestTwoKeys = new Set(
    [...new Set(providerResult.points.map((point) => point.indicatorCode))].flatMap((indicatorCode) =>
      providerResult.points
        .filter((point) => point.indicatorCode === indicatorCode)
        .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())
        .slice(0, 2)
        .map((point) => `${point.indicatorCode}:${point.observedAt.toISOString()}`),
    ),
  );

  return {
    ...providerResult,
    points: providerResult.points.filter((point) => {
      const latestObservedAt = latestObservedAtByCode.get(point.indicatorCode);
      return (
        latestObservedAt === undefined ||
        point.observedAt.getTime() >= latestObservedAt ||
        latestTwoKeys.has(`${point.indicatorCode}:${point.observedAt.toISOString()}`)
      );
    }),
  };
}

function resolveProviders(input: SyncExternalIndicatorsInput): readonly ExternalIndicatorProvider[] {
  if (input.deps?.providers) {
    return input.deps.providers;
  }

  if (input.deps?.provider) {
    return [input.deps.provider];
  }

  return [opinetDubaiProvider, fredIndicatorProvider];
}

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function syncExternalIndicators(
  input: SyncExternalIndicatorsInput = {},
): Promise<IndicatorBatchSyncResult> {
  const providers = resolveProviders(input);
  const runSync = input.deps?.runSync ?? runIndicatorSync;
  const loadLatestStates = input.deps?.loadLatestStates ?? loadLatestIndicatorStates;
  const stateWriter = input.deps?.stateWriter ?? {
    checking: markIndicatorSyncChecking,
    succeeded: markIndicatorSyncSucceeded,
    failed: markIndicatorSyncFailed,
  };
  const indicatorCodes = [...new Set(input.indicatorCodes?.length ? input.indicatorCodes : externalIndicatorCodes)];
  const providerResults: IndicatorSyncResult[] = [];
  const indicatorStatuses: IndicatorSyncStatus[] = [];

  for (const provider of providers) {
    const requestedCodes = indicatorCodes.filter((indicatorCode) =>
      provider.supportedIndicatorCodes.includes(indicatorCode),
    );

    if (requestedCodes.length === 0) {
      continue;
    }

    const attemptedAt = new Date();
    await Promise.all(
      requestedCodes.map((indicatorCode) =>
        stateWriter.checking({ indicatorCode, providerKey: provider.providerKey, attemptedAt }),
      ),
    );

    try {
      const providerResult = await provider.fetchHistory({
        indicatorCodes: requestedCodes,
        observedAtOrAfter: input.observedAtOrAfter,
        observedAtOrBefore: input.observedAtOrBefore,
        fetchImpl: input.fetchImpl,
        signal: input.signal,
      });
      const latestStates = await loadLatestStates({ indicatorCodes: requestedCodes });
      const persistenceResult = filterPointsForPersistence(providerResult, latestStates);

      const pointsByCode = new Map(
        requestedCodes.map((indicatorCode) => {
          const codePoints = providerResult.points.filter((point) => point.indicatorCode === indicatorCode);
          const latestObservedAt = codePoints.reduce<Date | null>(
            (latest, point) => (!latest || point.observedAt > latest ? point.observedAt : latest),
            null,
          );

          if (!latestObservedAt) {
            throw new Error(`${provider.providerKey} returned no valid daily '${indicatorCode}' observations.`);
          }

          const storedLatest = latestStates.find((state) => state.indicatorCode === indicatorCode)?.observedAt;
          if (storedLatest && latestObservedAt < storedLatest) {
            throw new Error(
              `${provider.providerKey} latest '${indicatorCode}' observation regressed from ` +
                `${storedLatest.toISOString()} to ${latestObservedAt.toISOString()}.`,
            );
          }

          return [indicatorCode, { codePoints, latestObservedAt }] as const;
        }),
      );
      const result = await runSync({ providerResult: persistenceResult });
      providerResults.push(result);

      for (const indicatorCode of requestedCodes) {
        const { codePoints, latestObservedAt } = pointsByCode.get(indicatorCode)!;

        await stateWriter.succeeded({
          indicatorCode,
          providerKey: provider.providerKey,
          attemptedAt,
          latestObservedAt,
        });
        indicatorStatuses.push({
          indicatorCode,
          providerKey: provider.providerKey,
          status: 'succeeded',
          errorSummary: null,
          acceptedPointCount: codePoints.length,
          persistedCount: result.records.filter((record) => record.indicatorCode === indicatorCode).length,
          latestObservedAt,
        });
      }
    } catch (error) {
      await Promise.all(
        requestedCodes.map((indicatorCode) =>
          stateWriter.failed({ indicatorCode, providerKey: provider.providerKey, attemptedAt, error }),
        ),
      );
      indicatorStatuses.push(
        ...requestedCodes.map((indicatorCode) => ({
          indicatorCode,
          providerKey: provider.providerKey,
          status: 'failed' as const,
          errorSummary: errorSummary(error),
          acceptedPointCount: 0,
          persistedCount: 0,
          latestObservedAt: null,
        })),
      );
    }
  }

  const latestStates = await loadLatestStates({ indicatorCodes });

  return {
    providerKey: [...new Set(providerResults.map((result) => result.providerKey))].join('+') || 'multi-provider',
    acceptedPointCount: providerResults.reduce((sum, result) => sum + result.acceptedPointCount, 0),
    persistedCount: providerResults.reduce((sum, result) => sum + result.persistedCount, 0),
    createdCount: providerResults.reduce((sum, result) => sum + result.createdCount, 0),
    updatedCount: providerResults.reduce((sum, result) => sum + result.updatedCount, 0),
    records: providerResults.flatMap((result) => result.records),
    latestStates,
    indicatorStatuses,
  };
}
