import type { Prisma } from "@prisma/client";

export type ExternalIndicatorCode = "dubai" | "brent" | "wti" | "usd-krw";

export type ExternalIndicatorUnit = "usd_per_barrel" | "krw_per_usd";

export interface ExternalIndicatorDefinition {
  code: ExternalIndicatorCode;
  name: string;
  unit: ExternalIndicatorUnit;
  marketScope: "national-average";
}

export interface ExternalIndicatorPoint {
  indicatorCode: ExternalIndicatorCode;
  observedAt: Date;
  value: number;
  sourcePayload?: Prisma.InputJsonValue;
}

export interface ExternalIndicatorHistoryRecord {
  id: string;
  indicatorCode: ExternalIndicatorCode;
  observedAt: Date;
  value: number;
  sourcePayload: Prisma.JsonValue | null;
  createdAt: Date;
  collectedAt: Date;
}

export interface LatestExternalIndicatorState {
  indicatorCode: ExternalIndicatorCode;
  observedAt: Date;
  value: number;
  collectedAt: Date;
}

export interface PersistIndicatorHistoryResult {
  persistedCount: number;
  createdCount: number;
  updatedCount: number;
  records: ExternalIndicatorHistoryRecord[];
}

export interface IndicatorSyncResult {
  providerKey: string;
  persistedCount: number;
  createdCount: number;
  updatedCount: number;
  acceptedPointCount: number;
  records: ExternalIndicatorHistoryRecord[];
  latestStates: LatestExternalIndicatorState[];
}

export interface IndicatorSyncStatus {
  indicatorCode: ExternalIndicatorCode;
  providerKey: string;
  status: "succeeded" | "failed";
  errorSummary: string | null;
  acceptedPointCount: number;
  persistedCount: number;
  latestObservedAt: Date | null;
}

export interface IndicatorBatchSyncResult extends IndicatorSyncResult {
  indicatorStatuses: IndicatorSyncStatus[];
}
