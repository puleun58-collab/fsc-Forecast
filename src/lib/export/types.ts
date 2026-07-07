import type { ForecastApprovalState, ForecastHorizonKind } from "@prisma/client";

import type { AggregateSeriesSnapshot } from "../aggregates";
import type { ExternalIndicatorCode, ExternalIndicatorUnit } from "../external-indicators/types";

export interface ExportSnapshotSummary {
  id: string;
  datasetKey: string;
  marketScope: "national-average";
  triggerReason: string;
  currentTruthCutoffAt: string | null;
  completedAt: string | null;
}

export interface ExportForecastPoint {
  horizonKind: ForecastHorizonKind;
  horizonIndex: number;
  targetDate: string;
  pointKrwPerL: number;
  lowerBoundKrwPerL: number | null;
  upperBoundKrwPerL: number | null;
}

export interface ExportForecastDataset {
  status: "ready" | "missing";
  runId: string | null;
  approvalState: ForecastApprovalState | null;
  completedAt: string | null;
  backtestWeeks: number | null;
  mapePct: number | null;
  maeKrwPerL: number | null;
  degradedReason: string | null;
  weeklyPoints: ExportForecastPoint[];
  monthlyPoints: ExportForecastPoint[];
}

export interface ExportEvidenceIndicator {
  indicatorCode: ExternalIndicatorCode;
  indicatorName: string;
  unit: ExternalIndicatorUnit;
  status: "ready" | "missing";
  observedAt: string | null;
  value: number | null;
}

export interface ExportDataset {
  snapshot: ExportSnapshotSummary;
  chartData: AggregateSeriesSnapshot;
  forecast: ExportForecastDataset;
  evidenceIndicators: ExportEvidenceIndicator[];
}

export interface BuildExportDatasetResult {
  status: "ready" | "missing_snapshot";
  dataset: ExportDataset | null;
}
