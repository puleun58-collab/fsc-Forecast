import { externalIndicatorCodes } from './catalog';
import { fredIndicatorProvider } from './fred-provider';
import { runIndicatorSync } from './run-indicator-sync';
import type { ExternalIndicatorProvider } from './provider-contract';
import type { ExternalIndicatorCode, IndicatorSyncResult } from './types';

interface SyncExternalIndicatorsDeps {
  provider: ExternalIndicatorProvider;
  runSync: typeof runIndicatorSync;
}

export interface SyncExternalIndicatorsInput {
  indicatorCodes?: readonly ExternalIndicatorCode[];
  observedAtOrAfter?: Date;
  observedAtOrBefore?: Date;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  deps?: Partial<SyncExternalIndicatorsDeps>;
}

export async function syncExternalIndicators(
  input: SyncExternalIndicatorsInput = {},
): Promise<IndicatorSyncResult> {
  const provider = input.deps?.provider ?? fredIndicatorProvider;
  const runSync = input.deps?.runSync ?? runIndicatorSync;
  const indicatorCodes = input.indicatorCodes?.length ? input.indicatorCodes : externalIndicatorCodes;

  const providerResult = await provider.fetchHistory({
    indicatorCodes,
    observedAtOrAfter: input.observedAtOrAfter,
    observedAtOrBefore: input.observedAtOrBefore,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });

  return runSync({ providerResult });
}
