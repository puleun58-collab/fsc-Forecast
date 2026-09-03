import {
  summarizeWindow,
  type RunWalkForwardBacktestResult,
  type WalkForwardEvaluationPoint,
} from "./run-walk-forward-backtest";
import type { ForecastModelParams } from "./forecast-model-config";

export function forecastChurn(points: readonly WalkForwardEvaluationPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }

  const diffs = points
    .slice(1)
    .map((point, index) => Math.abs(point.forecastKrwPerL - points[index].forecastKrwPerL));

  return diffs.reduce((total, value) => total + value, 0) / diffs.length;
}

export interface RebuildCandidateBacktestInput {
  base: RunWalkForwardBacktestResult;
  params: ForecastModelParams;
  oneStepPoints: readonly WalkForwardEvaluationPoint[];
  recentWindowWeeks: number;
  longWindowWeeks: number;
}

/**
 * 이미 계산된 walk-forward 결과를 사후 보정한 다음 주 예측으로 다시 요약한다.
 * 새 walk-forward를 실행하지 않으며 기본 모델의 예측 공식도 바꾸지 않는다.
 */
export function rebuildCandidateBacktest({
  base,
  params,
  oneStepPoints,
  recentWindowWeeks,
  longWindowWeeks,
}: RebuildCandidateBacktestInput): RunWalkForwardBacktestResult {
  const recentPoints = oneStepPoints.slice(-recentWindowWeeks);
  const longPoints = oneStepPoints.slice(-longWindowWeeks);

  return {
    ...base,
    params,
    recentOneStep: summarizeWindow(recentPoints, recentWindowWeeks, forecastChurn(recentPoints)),
    longOneStep: summarizeWindow(longPoints, longWindowWeeks, forecastChurn(longPoints)),
    oneStepPoints: [...oneStepPoints],
  };
}
