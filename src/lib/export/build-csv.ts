import type { ExportDataset } from "./types";

function escapeCsvValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const normalized = String(value);

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function appendSection(lines: string[], title: string, header: string[], rows: Array<Array<string | number | null>>): void {
  lines.push(title);
  lines.push(header.map(escapeCsvValue).join(","));

  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(","));
  }

  lines.push("");
}

export function buildCsv(dataset: ExportDataset): string {
  const lines: string[] = [];

  appendSection(
    lines,
    "snapshot",
    ["field", "value"],
    [
      ["snapshot_id", dataset.snapshot.id],
      ["dataset_key", dataset.snapshot.datasetKey],
      ["market_scope", dataset.snapshot.marketScope],
      ["trigger_reason", dataset.snapshot.triggerReason],
      ["current_truth_cutoff_at", dataset.snapshot.currentTruthCutoffAt],
      ["completed_at", dataset.snapshot.completedAt],
      ["coverage_start_date", dataset.chartData.coverageStartDate],
      ["coverage_end_date", dataset.chartData.coverageEndDate],
      ["latest_observed_price_krw_per_l", dataset.chartData.latestObservedPriceKrwPerL],
      ["daily_point_count", dataset.chartData.counts.daily],
      ["weekly_point_count", dataset.chartData.counts.weekly],
      ["monthly_point_count", dataset.chartData.counts.monthly],
    ],
  );

  appendSection(
    lines,
    "evidence_indicators",
    ["indicator_code", "indicator_name", "unit", "status", "observed_at", "value"],
    dataset.evidenceIndicators.map((indicator) => [
      indicator.indicatorCode,
      indicator.indicatorName,
      indicator.unit,
      indicator.status,
      indicator.observedAt,
      indicator.value,
    ]),
  );

  appendSection(
    lines,
    "daily_chart",
    ["price_date", "observed_price_krw_per_l", "current_revision_id", "latest_recompute_snapshot_id"],
    dataset.chartData.daily.points.map((point) => [
      point.priceDate,
      point.observedPriceKrwPerL,
      point.currentRevisionId,
      point.latestRecomputeSnapshotId,
    ]),
  );

  appendSection(
    lines,
    "weekly_chart",
    [
      "week_key",
      "week_start_date",
      "week_end_date",
      "sample_count",
      "average_price_krw_per_l",
      "opening_price_krw_per_l",
      "closing_price_krw_per_l",
      "min_price_krw_per_l",
      "max_price_krw_per_l",
      "absolute_change_krw_per_l",
      "percent_change_from_open",
    ],
    dataset.chartData.weekly.points.map((point) => [
      point.weekKey,
      point.weekStartDate,
      point.weekEndDate,
      point.sampleCount,
      point.averagePriceKrwPerL,
      point.openingPriceKrwPerL,
      point.closingPriceKrwPerL,
      point.minPriceKrwPerL,
      point.maxPriceKrwPerL,
      point.absoluteChangeKrwPerL,
      point.percentChangeFromOpen,
    ]),
  );

  appendSection(
    lines,
    "monthly_chart",
    [
      "month_key",
      "month_start_date",
      "month_end_date",
      "sample_count",
      "average_price_krw_per_l",
      "opening_price_krw_per_l",
      "closing_price_krw_per_l",
      "min_price_krw_per_l",
      "max_price_krw_per_l",
      "absolute_change_krw_per_l",
      "percent_change_from_open",
    ],
    dataset.chartData.monthly.points.map((point) => [
      point.monthKey,
      point.monthStartDate,
      point.monthEndDate,
      point.sampleCount,
      point.averagePriceKrwPerL,
      point.openingPriceKrwPerL,
      point.closingPriceKrwPerL,
      point.minPriceKrwPerL,
      point.maxPriceKrwPerL,
      point.absoluteChangeKrwPerL,
      point.percentChangeFromOpen,
    ]),
  );

  appendSection(
    lines,
    "forecast_summary",
    ["field", "value"],
    [
      ["status", dataset.forecast.status],
      ["run_id", dataset.forecast.runId],
      ["approval_state", dataset.forecast.approvalState],
      ["completed_at", dataset.forecast.completedAt],
      ["backtest_weeks", dataset.forecast.backtestWeeks],
      ["mape_pct", dataset.forecast.mapePct],
      ["mae_krw_per_l", dataset.forecast.maeKrwPerL],
      ["degraded_reason", dataset.forecast.degradedReason],
    ],
  );

  appendSection(
    lines,
    "forecast_points",
    [
      "horizon_kind",
      "horizon_index",
      "target_date",
      "point_krw_per_l",
      "lower_bound_krw_per_l",
      "upper_bound_krw_per_l",
    ],
    [...dataset.forecast.weeklyPoints, ...dataset.forecast.monthlyPoints].map((point) => [
      point.horizonKind,
      point.horizonIndex,
      point.targetDate,
      point.pointKrwPerL,
      point.lowerBoundKrwPerL,
      point.upperBoundKrwPerL,
    ]),
  );

  return `${lines.join("\n")}`;
}
