import type { Prisma, RunStatus } from "@prisma/client";

import type { NormalizedDieselPriceRow } from "../opinet/types";

export const OPINET_DATASET_KEY = "national-average-opinet-diesel";
export const OPINET_RECOMPUTE_TRIGGER_REASON = "opinet-ingest-reconcile";

export type IngestTriggerKind = "manual" | "scheduled" | "retry";
export type ReconcileAction = "created" | "updated" | "unchanged";

export interface OpinetIngestRequest {
  triggerKind: IngestTriggerKind;
  requestedByRuntime: string;
  fetchImpl?: typeof fetch;
  sourceWindowStart?: Date;
  sourceWindowEnd?: Date;
  metadata?: Prisma.InputJsonValue;
}

export interface IngestRunLifecycleRecord {
  id: string;
  datasetKey: string;
  triggerKind: string;
  requestedByRuntime: string;
  status: RunStatus;
  sourceWindowStart: Date | null;
  sourceWindowEnd: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorSummary: string | null;
}

export interface ReconciledDailyPriceChange {
  action: ReconcileAction;
  priceDate: string;
  observedPriceKrwPerL: number;
  currentRevisionId: string;
  previousRevisionId: string | null;
}

export interface ReconcileDailyPricesResult {
  datasetKey: string;
  ingestRunId: string;
  processedRowCount: number;
  createdRevisionCount: number;
  supersededRevisionCount: number;
  unchangedRowCount: number;
  currentRowCount: number;
  changes: ReconciledDailyPriceChange[];
  latestCurrentRevisionIds: string[];
}

export interface RecomputeSnapshotResult {
  snapshotId: string;
  datasetKey: string;
  triggeringIngestRunId: string;
  currentTruthCutoffAt: Date;
  currentRowCount: number;
  latestCurrentRevisionIds: string[];
}

export interface IngestCacheRefreshSummary {
  status: 'succeeded' | 'failed';
  errorSummary: string | null;
  daily: {
    fetchedCount: number;
    savedCount: number;
  };
  weekly: {
    fetchedCount: number;
    savedCount: number;
  };
  monthly: {
    fetchedCount: number;
    savedCount: number;
  };
  quarterly: {
    fetchedCount: number;
    savedCount: number;
  };
}

export interface IngestForecastSummary {
  forecastRunId: string;
  approvalState: string;
  degradedReason: string | null;
  weeklySeriesCount: number;
  monthlySeriesCount: number;
  weeklyForecastPointCount: number;
  monthlyForecastPointCount: number;
}

export interface OpinetIngestResult {
  ingestRun: IngestRunLifecycleRecord;
  fetchedRows: NormalizedDieselPriceRow[];
  reconcile: ReconcileDailyPricesResult;
  snapshot: RecomputeSnapshotResult;
  forecast: IngestForecastSummary;
  cacheRefresh: IngestCacheRefreshSummary;
}
