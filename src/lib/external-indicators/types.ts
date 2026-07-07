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
}
