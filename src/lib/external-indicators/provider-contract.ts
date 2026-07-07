import type { ExternalIndicatorCode, ExternalIndicatorPoint } from "./types";

export interface ExternalIndicatorProviderRequest {
  indicatorCodes: readonly ExternalIndicatorCode[];
  observedAtOrAfter?: Date;
  observedAtOrBefore?: Date;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface ExternalIndicatorProviderResult {
  providerKey: string;
  points: ExternalIndicatorPoint[];
}

export interface ExternalIndicatorProvider {
  providerKey: string;
  supportedIndicatorCodes: readonly ExternalIndicatorCode[];
  fetchHistory(
    request: ExternalIndicatorProviderRequest,
  ): Promise<ExternalIndicatorProviderResult>;
}
