import { ForecastApprovalState } from "@prisma/client";

import type {
  WalkForwardEvaluationPoint,
  WalkForwardWindowMetrics,
} from "./run-walk-forward-backtest";
import {
  FORECAST_MAPE_THRESHOLD_PCT,
  type EvaluateMapeGateResult,
  type ForecastBacktestPoint,
} from "./types";

export interface BuildForecastQualityGateInput {
  recent: WalkForwardWindowMetrics;
  oneStepPoints: readonly WalkForwardEvaluationPoint[];
  mapeThresholdPct?: number;
  unavailableReason?: string | null;
}

export function buildForecastQualityGate(
  input: BuildForecastQualityGateInput,
): EvaluateMapeGateResult {
  const thresholdPct = input.mapeThresholdPct ?? FORECAST_MAPE_THRESHOLD_PCT;
  const backtestPoints: ForecastBacktestPoint[] = input.oneStepPoints.map((point) => ({
    targetDate: point.targetDate,
    actualKrwPerL: point.actualKrwPerL,
    forecastKrwPerL: point.forecastKrwPerL,
    absoluteErrorKrwPerL: Math.round(point.absoluteErrorKrwPerL * 1000) / 1000,
    absolutePercentageErrorPct:
      point.absolutePercentageErrorPct === null
        ? null
        : Math.round(point.absolutePercentageErrorPct * 1000) / 1000,
  }));
  const skippedZeroActualCount = input.oneStepPoints.filter(
    (point) => point.absolutePercentageErrorPct === null,
  ).length;
  const mapePct = input.recent.mapePct;
  const approvalState =
    input.unavailableReason === null || input.unavailableReason === undefined
      ? mapePct !== null && mapePct <= thresholdPct
        ? ForecastApprovalState.approved
        : ForecastApprovalState.degraded
      : ForecastApprovalState.degraded;

  return {
    approvalState,
    backtestWeeks: input.recent.windowWeeks,
    evaluatedPointCount: input.recent.sampleCount,
    skippedZeroActualCount,
    thresholdPct,
    mapePct,
    maeKrwPerL: input.recent.maeKrwPerL,
    degradedReason:
      approvalState === ForecastApprovalState.approved
        ? null
        : input.unavailableReason ??
          (mapePct === null ? "walk_forward_mape_unavailable" : `mape_threshold_exceeded:${mapePct}`),
    backtestPoints,
  };
}
