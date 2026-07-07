import * as XLSX from "xlsx";

import type { ExportDataset } from "./types";

function appendJsonSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, string | number | null>[]): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

export function buildXlsx(dataset: ExportDataset): Uint8Array {
  const workbook = XLSX.utils.book_new();

  appendJsonSheet(workbook, "snapshot", [
    {
      snapshot_id: dataset.snapshot.id,
      dataset_key: dataset.snapshot.datasetKey,
      market_scope: dataset.snapshot.marketScope,
      trigger_reason: dataset.snapshot.triggerReason,
      current_truth_cutoff_at: dataset.snapshot.currentTruthCutoffAt,
      completed_at: dataset.snapshot.completedAt,
      coverage_start_date: dataset.chartData.coverageStartDate,
      coverage_end_date: dataset.chartData.coverageEndDate,
      latest_observed_price_krw_per_l: dataset.chartData.latestObservedPriceKrwPerL,
      daily_point_count: dataset.chartData.counts.daily,
      weekly_point_count: dataset.chartData.counts.weekly,
      monthly_point_count: dataset.chartData.counts.monthly,
    },
  ]);

  appendJsonSheet(
    workbook,
    "evidence",
    dataset.evidenceIndicators.map((indicator) => ({
      indicator_code: indicator.indicatorCode,
      indicator_name: indicator.indicatorName,
      unit: indicator.unit,
      status: indicator.status,
      observed_at: indicator.observedAt,
      value: indicator.value,
    })),
  );

  appendJsonSheet(
    workbook,
    "daily_chart",
    dataset.chartData.daily.points.map((point) => ({
      price_date: point.priceDate,
      observed_price_krw_per_l: point.observedPriceKrwPerL,
      current_revision_id: point.currentRevisionId,
      latest_recompute_snapshot_id: point.latestRecomputeSnapshotId,
    })),
  );

  appendJsonSheet(
    workbook,
    "weekly_chart",
    dataset.chartData.weekly.points.map((point) => ({
      week_key: point.weekKey,
      week_start_date: point.weekStartDate,
      week_end_date: point.weekEndDate,
      sample_count: point.sampleCount,
      average_price_krw_per_l: point.averagePriceKrwPerL,
      opening_price_krw_per_l: point.openingPriceKrwPerL,
      closing_price_krw_per_l: point.closingPriceKrwPerL,
      min_price_krw_per_l: point.minPriceKrwPerL,
      max_price_krw_per_l: point.maxPriceKrwPerL,
      absolute_change_krw_per_l: point.absoluteChangeKrwPerL,
      percent_change_from_open: point.percentChangeFromOpen,
    })),
  );

  appendJsonSheet(
    workbook,
    "monthly_chart",
    dataset.chartData.monthly.points.map((point) => ({
      month_key: point.monthKey,
      month_start_date: point.monthStartDate,
      month_end_date: point.monthEndDate,
      sample_count: point.sampleCount,
      average_price_krw_per_l: point.averagePriceKrwPerL,
      opening_price_krw_per_l: point.openingPriceKrwPerL,
      closing_price_krw_per_l: point.closingPriceKrwPerL,
      min_price_krw_per_l: point.minPriceKrwPerL,
      max_price_krw_per_l: point.maxPriceKrwPerL,
      absolute_change_krw_per_l: point.absoluteChangeKrwPerL,
      percent_change_from_open: point.percentChangeFromOpen,
    })),
  );

  appendJsonSheet(workbook, "forecast_summary", [
    {
      status: dataset.forecast.status,
      run_id: dataset.forecast.runId,
      approval_state: dataset.forecast.approvalState,
      completed_at: dataset.forecast.completedAt,
      backtest_weeks: dataset.forecast.backtestWeeks,
      mape_pct: dataset.forecast.mapePct,
      mae_krw_per_l: dataset.forecast.maeKrwPerL,
      degraded_reason: dataset.forecast.degradedReason,
    },
  ]);

  appendJsonSheet(
    workbook,
    "forecast_points",
    [...dataset.forecast.weeklyPoints, ...dataset.forecast.monthlyPoints].map((point) => ({
      horizon_kind: point.horizonKind,
      horizon_index: point.horizonIndex,
      target_date: point.targetDate,
      point_krw_per_l: point.pointKrwPerL,
      lower_bound_krw_per_l: point.lowerBoundKrwPerL,
      upper_bound_krw_per_l: point.upperBoundKrwPerL,
    })),
  );

  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
}
