import { ForecastApprovalState } from "@prisma/client";

import { buildBaselineForecast } from "./build-baseline-forecast";
import {
  FORECAST_BACKTEST_WEEKS,
  FORECAST_MAPE_THRESHOLD_PCT,
  type EvaluateMapeGateInput,
  type EvaluateMapeGateResult,
  type ForecastBacktestPoint,
} from "./types";

function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

export function evaluateMapeGate(input: EvaluateMapeGateInput): EvaluateMapeGateResult {
  const backtestWeeks = input.backtestWeeks ?? FORECAST_BACKTEST_WEEKS;
  const thresholdPct = input.mapeThresholdPct ?? FORECAST_MAPE_THRESHOLD_PCT;

  if (backtestWeeks <= 0) {
    throw new Error("MAPE gate backtestWeeks must be greater than zero.");
  }

  if (input.weeklySeries.length <= backtestWeeks) {
    return {
      approvalState: ForecastApprovalState.degraded,
      backtestWeeks,
      evaluatedPointCount: 0,
      skippedZeroActualCount: 0,
      thresholdPct,
      mapePct: null,
      maeKrwPerL: null,
      degradedReason: `insufficient_weekly_history:${input.weeklySeries.length}`,
      backtestPoints: [],
    };
  }

  const startIndex = input.weeklySeries.length - backtestWeeks;
  const backtestPoints: ForecastBacktestPoint[] = [];
  let skippedZeroActualCount = 0;
  let absoluteErrorTotal = 0;
  let absolutePercentageErrorTotal = 0;
  let mapeDenominator = 0;

  for (let index = startIndex; index < input.weeklySeries.length; index += 1) {
    const historicalSlice = input.weeklySeries.slice(0, index);
    const actualPoint = input.weeklySeries[index];
    const baseline = buildBaselineForecast({
      horizonKind: "weekly",
      historicalPoints: historicalSlice,
      horizonCount: 1,
    });
    const forecastPoint = baseline.projections[0];
    const absoluteErrorKrwPerL = Math.abs(actualPoint.pointKrwPerL - forecastPoint.pointKrwPerL);
    const absolutePercentageErrorPct =
      actualPoint.pointKrwPerL === 0
        ? null
        : (absoluteErrorKrwPerL / actualPoint.pointKrwPerL) * 100;

    absoluteErrorTotal += absoluteErrorKrwPerL;

    if (absolutePercentageErrorPct === null) {
      skippedZeroActualCount += 1;
    } else {
      absolutePercentageErrorTotal += absolutePercentageErrorPct;
      mapeDenominator += 1;
    }

    backtestPoints.push({
      targetDate: actualPoint.targetDate,
      actualKrwPerL: actualPoint.pointKrwPerL,
      forecastKrwPerL: forecastPoint.pointKrwPerL,
      absoluteErrorKrwPerL: roundMetric(absoluteErrorKrwPerL) ?? 0,
      absolutePercentageErrorPct: roundMetric(absolutePercentageErrorPct),
    });
  }

  const evaluatedPointCount = backtestPoints.length;
  const mapePct = mapeDenominator === 0 ? null : absolutePercentageErrorTotal / mapeDenominator;
  const maeKrwPerL = evaluatedPointCount === 0 ? null : absoluteErrorTotal / evaluatedPointCount;
  const approvalState =
    mapePct !== null && mapePct <= thresholdPct
      ? ForecastApprovalState.approved
      : ForecastApprovalState.degraded;

  return {
    approvalState,
    backtestWeeks,
    evaluatedPointCount,
    skippedZeroActualCount,
    thresholdPct,
    mapePct: roundMetric(mapePct),
    maeKrwPerL: roundMetric(maeKrwPerL),
    degradedReason:
      approvalState === ForecastApprovalState.approved
        ? null
        : mapePct === null
          ? "mape_unavailable_non_zero_actuals"
          : `mape_threshold_exceeded:${roundMetric(mapePct)}`,
    backtestPoints,
  };
}
