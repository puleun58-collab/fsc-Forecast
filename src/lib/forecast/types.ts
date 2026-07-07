import type {
  ForecastApprovalState,
  ForecastHorizonKind,
  Prisma,
  RunStatus,
} from "@prisma/client";

import type { ExternalIndicatorCode } from "../external-indicators/types";

export const FORECAST_DATASET_KEY = "national-average-opinet-diesel";
export const FORECAST_BACKTEST_WEEKS = 26;
export const FORECAST_MISSING_VALUE = null;
export const FORECAST_MAPE_THRESHOLD_PCT = 5;
export const FORECAST_WEEKLY_HORIZON_COUNT = 4;
export const FORECAST_MONTHLY_HORIZON_COUNT = 3;

export interface ForecastDailyPriceRow {
  priceDate: Date;
  observedPriceKrwPerL: number;
  currentRevisionId: string;
}

export interface ForecastIndicatorSnapshot {
  indicatorCode: ExternalIndicatorCode;
  observedAt: Date;
  value: number;
  previousObservedAt: Date | null;
  previousValue: number | null;
  percentChange: number | null;
}

export interface ForecastSeriesPoint {
  horizonKind: ForecastHorizonKind;
  periodStart: Date;
  periodEnd: Date;
  targetDate: Date;
  pointKrwPerL: number;
  sampleCount: number;
}

export interface ForecastProjectionPoint {
  horizonKind: ForecastHorizonKind;
  horizonIndex: number;
  targetDate: Date;
  pointKrwPerL: number;
  lowerBoundKrwPerL: number | null;
  upperBoundKrwPerL: number | null;
}

export interface ForecastBacktestPoint {
  targetDate: Date;
  actualKrwPerL: number;
  forecastKrwPerL: number;
  absoluteErrorKrwPerL: number;
  absolutePercentageErrorPct: number | null;
}

export interface ForecastBaselineDiagnostics {
  historyCount: number;
  lookbackCount: number;
  baselineLevelKrwPerL: number;
  meanDeltaKrwPerL: number;
  residualMeanAbsoluteErrorKrwPerL: number;
}

export interface BuildBaselineForecastInput {
  horizonKind: ForecastHorizonKind;
  historicalPoints: readonly ForecastSeriesPoint[];
  horizonCount: number;
  lookbackCount?: number;
}

export interface BuildBaselineForecastResult {
  horizonKind: ForecastHorizonKind;
  horizonCount: number;
  diagnostics: ForecastBaselineDiagnostics;
  projections: ForecastProjectionPoint[];
}

export interface EvaluateMapeGateInput {
  weeklySeries: readonly ForecastSeriesPoint[];
  backtestWeeks?: number;
  mapeThresholdPct?: number;
}

export interface EvaluateMapeGateResult {
  approvalState: ForecastApprovalState;
  backtestWeeks: number;
  evaluatedPointCount: number;
  skippedZeroActualCount: number;
  thresholdPct: number;
  mapePct: number | null;
  maeKrwPerL: number | null;
  degradedReason: string | null;
  backtestPoints: ForecastBacktestPoint[];
}

export interface ForecastRunRecord {
  id: string;
  recomputeSnapshotId: string;
  status: RunStatus;
  approvalState: ForecastApprovalState;
  backtestWeeks: number | null;
  mapePct: number | null;
  maeKrwPerL: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorSummary: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface RunForecastPipelineInput {
  recomputeSnapshotId: string;
  requestedByRuntime: string;
  tx?: Prisma.TransactionClient;
}

export interface RunForecastPipelineResult {
  forecastRun: ForecastRunRecord;
  status: "succeeded";
  recomputeSnapshotId: string;
  datasetKey: string;
  approvalState: ForecastApprovalState;
  degradedReason: string | null;
  weeklySeries: ForecastSeriesPoint[];
  monthlySeries: ForecastSeriesPoint[];
  weeklyForecastPoints: ForecastProjectionPoint[];
  monthlyForecastPoints: ForecastProjectionPoint[];
  forecastPoints: ForecastProjectionPoint[];
  gate: EvaluateMapeGateResult;
  indicators: ForecastIndicatorSnapshot[];
}
