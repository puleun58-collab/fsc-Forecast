import { externalIndicatorCodes } from './catalog';
import { fredIndicatorProvider } from './fred-provider';
import { loadLatestIndicatorStates } from './latest-indicator-states';
import { runIndicatorSync } from './run-indicator-sync';
import type { ExternalIndicatorProvider, ExternalIndicatorProviderResult } from './provider-contract';
import type { ExternalIndicatorCode, IndicatorSyncResult } from './types';

interface SyncExternalIndicatorsDeps {
  provider: ExternalIndicatorProvider;
  runSync: typeof runIndicatorSync;
  loadLatestStates: typeof loadLatestIndicatorStates;
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

  return {
    ...providerResult,
    points: providerResult.points.filter((point) => {
      const latestObservedAt = latestObservedAtByCode.get(point.indicatorCode);

      if (latestObservedAt === undefined) {
        return true;
      }

      return point.observedAt.getTime() >= latestObservedAt;
    }),
  };
}

export async function syncExternalIndicators(
  input: SyncExternalIndicatorsInput = {},
): Promise<IndicatorSyncResult> {
  const provider = input.deps?.provider ?? fredIndicatorProvider;
  const runSync = input.deps?.runSync ?? runIndicatorSync;
  const loadLatestStates = input.deps?.loadLatestStates ?? loadLatestIndicatorStates;
  const indicatorCodes = input.indicatorCodes?.length ? input.indicatorCodes : externalIndicatorCodes;

  const providerResult = await provider.fetchHistory({
    indicatorCodes,
    observedAtOrAfter: input.observedAtOrAfter,
    observedAtOrBefore: input.observedAtOrBefore,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  const latestStates = await loadLatestStates({ indicatorCodes });
  const persistenceResult = filterPointsForPersistence(providerResult, latestStates);

  return runSync({ providerResult: persistenceResult });
}
