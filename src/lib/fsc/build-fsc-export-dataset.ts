import { externalIndicatorCodes } from '@/lib/external-indicators/catalog';
import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';
import { toQuarterNumber } from '@/lib/quarter/types';

import type { FscResultRecord } from './serialize-fsc-dto';

export interface FscExportSummaryRow {
  target_year: number;
  target_quarter: number;
  base_price: number;
  applied_price: number;
  quarter_average_price: number;
  price_diff: number;
  diff_ratio: number;
  fsc_30: number;
  fsc_70: number;
  actual_week_count: number;
  forecast_week_count: number;
  reliability_grade: string;
  data_freshness_status: string;
  calculated_at: string;
  approval_status: string;
}

export interface FscExportWeekRow {
  week_start_date: string;
  week_end_date: string;
  month: number;
  week_no: number;
  sequence_no: number;
  price_kind: string;
  price_krw_per_l: number;
  actual_price_krw_per_l: number | null;
  forecast_price_krw_per_l: number | null;
  base_price: number;
  price_diff: number;
  diff_ratio: number;
  forecast_source_kind: string | null;
  source_price_date: string | null;
}

export interface FscExportReliabilityRow {
  recent_13w_weekly_price_mae: number | null;
  recent_13w_weekly_price_mape: number | null;
  recent_13w_quarter_average_price_mae: number | null;
  recent_13w_direction_accuracy: number | null;
  recent_4w_weekly_price_mae: number | null;
  recent_4w_error_trend: string | null;
  recent_26w_weekly_price_mae: number | null;
  forecast_bias_4w: number | null;
  forecast_bias_13w: number | null;
  data_freshness_status: string;
  reliability_grade: string;
}

export interface FscExportCalculationBasisRow {
  calculation_formula_version: string;
  forecast_model_version: string | null;
  reference_year: number;
  reference_quarter: number;
  target_year: number;
  target_quarter: number;
  data_source: string;
  opinet_dataset_key: string;
  external_indicator_codes: string;
  base_price: number;
  applied_price: number;
  fsc_low_rate: number;
  fsc_high_rate: number;
  source_recompute_snapshot_id: string;
}

export interface FscExportApprovalAuditRow {
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  calculated_at: string;
  forecast_run_id: string | null;
  fsc_result_id: string;
}

export interface FscExportDataset {
  fileName: string;
  targetYear: number;
  targetQuarter: number;
  resultId: string;
  summary: FscExportSummaryRow[];
  quarterWeeks: FscExportWeekRow[];
  reliability: FscExportReliabilityRow[];
  calculationBasis: FscExportCalculationBasisRow[];
  approvalAudit: FscExportApprovalAuditRow[];
}

export interface BuildFscExportDatasetInput {
  year?: number;
  quarter?: number;
}

export interface BuildFscExportDatasetResult {
  status: 'ready' | 'missing_result';
  dataset: FscExportDataset | null;
  targetYear: number;
  targetQuarter: number;
}

function formatDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toNumber(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value.toString());
}

function buildFileName(targetYear: number, targetQuarter: number): string {
  return `fsc-forecast-${targetYear}-Q${targetQuarter}.xlsx`;
}

function assertQuarterPair(year: number | undefined, quarter: number | undefined): void {
  if ((year === undefined) !== (quarter === undefined)) {
    throw new Error('year와 quarter는 함께 전달해야 합니다.');
  }

  if (quarter !== undefined) {
    toQuarterNumber(quarter);
  }
}

function buildDataset(result: FscResultRecord): FscExportDataset {
  return {
    fileName: buildFileName(result.targetYear, result.targetQuarter),
    targetYear: result.targetYear,
    targetQuarter: result.targetQuarter,
    resultId: result.id,
    summary: [
      {
        target_year: result.targetYear,
        target_quarter: result.targetQuarter,
        base_price: Number(result.basePriceKrwPerL.toString()),
        applied_price: Number(result.appliedPriceKrwPerL.toString()),
        quarter_average_price: Number(result.quarterAverageKrwPerL.toString()),
        price_diff: Number(result.priceDiffKrwPerL.toString()),
        diff_ratio: Number(result.diffRatio.toString()),
        fsc_30: Number(result.fscLowKrwPerL.toString()),
        fsc_70: Number(result.fscHighKrwPerL.toString()),
        actual_week_count: result.actualWeekCount,
        forecast_week_count: result.forecastWeekCount,
        reliability_grade: result.reliabilityGrade,
        data_freshness_status: result.dataFreshnessStatus,
        calculated_at: result.createdAt.toISOString(),
        approval_status: result.approvalStatus,
      },
    ],
    quarterWeeks: result.weeks.map((week) => ({
      week_start_date: formatDate(week.weekStartDate)!,
      week_end_date: formatDate(week.weekEndDate)!,
      month: week.targetMonth,
      week_no: week.weekNo,
      sequence_no: week.sequenceNo,
      price_kind: week.priceKind,
      price_krw_per_l: Number(week.priceKrwPerL.toString()),
      actual_price_krw_per_l: toNumber(week.actualPriceKrwPerL),
      forecast_price_krw_per_l: toNumber(week.forecastPriceKrwPerL),
      base_price: Number(week.basePriceKrwPerL.toString()),
      price_diff: Number(week.priceDiffKrwPerL.toString()),
      diff_ratio: Number(week.diffRatio.toString()),
      forecast_source_kind: week.forecastSourceKind,
      source_price_date: formatDate(week.sourcePriceDate),
    })),
    reliability: [
      {
        recent_13w_weekly_price_mae: toNumber(result.recent13wWeeklyPriceMae),
        recent_13w_weekly_price_mape: toNumber(result.recent13wWeeklyPriceMape),
        recent_13w_quarter_average_price_mae: toNumber(result.recent13wQuarterAveragePriceMae),
        recent_13w_direction_accuracy: toNumber(result.recent13wDirectionAccuracy),
        recent_4w_weekly_price_mae: toNumber(result.recent4wWeeklyPriceMae),
        recent_4w_error_trend: result.recent4wErrorTrend,
        recent_26w_weekly_price_mae: toNumber(result.recent26wWeeklyPriceMae),
        forecast_bias_4w: toNumber(result.forecastBias4w),
        forecast_bias_13w: toNumber(result.forecastBias13w),
        data_freshness_status: result.dataFreshnessStatus,
        reliability_grade: result.reliabilityGrade,
      },
    ],
    calculationBasis: [
      {
        calculation_formula_version: result.calculationFormulaVersion,
        forecast_model_version: result.forecastModelVersion,
        reference_year: result.quarterSetting.referenceYear,
        reference_quarter: result.quarterSetting.referenceQuarter,
        target_year: result.targetYear,
        target_quarter: result.targetQuarter,
        data_source: 'opinet-current-truth-and-forecast',
        opinet_dataset_key: 'national-average-opinet-diesel',
        external_indicator_codes: externalIndicatorCodes.join(','),
        base_price: Number(result.basePriceKrwPerL.toString()),
        applied_price: Number(result.appliedPriceKrwPerL.toString()),
        fsc_low_rate: Number(result.fscLowRate.toString()),
        fsc_high_rate: Number(result.fscHighRate.toString()),
        source_recompute_snapshot_id: result.sourceRecomputeSnapshotId,
      },
    ],
    approvalAudit: [
      {
        approval_status: result.approvalStatus,
        approved_by: result.approvedBy,
        approved_at: formatDateTime(result.approvedAt),
        calculated_at: result.createdAt.toISOString(),
        forecast_run_id: result.forecastRunId,
        fsc_result_id: result.id,
      },
    ],
  };
}

export async function buildFscExportDataset(input: BuildFscExportDatasetInput = {}): Promise<BuildFscExportDatasetResult> {
  assertQuarterPair(input.year, input.quarter);

  let targetYear: number;
  let targetQuarter: number;

  if (input.year !== undefined && input.quarter !== undefined) {
    targetYear = input.year;
    targetQuarter = toQuarterNumber(input.quarter);
  } else {
    const activeQuarter = await ensureActiveQuarter();
    targetYear = activeQuarter.targetYear;
    targetQuarter = activeQuarter.targetQuarter;
  }

  const result = await findLatestBaseFscResultByQuarter(targetYear, targetQuarter);

  if (result === null) {
    return {
      status: 'missing_result',
      dataset: null,
      targetYear,
      targetQuarter,
    };
  }

  return {
    status: 'ready',
    dataset: buildDataset(result),
    targetYear,
    targetQuarter,
  };
}
