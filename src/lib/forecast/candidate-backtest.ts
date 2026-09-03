import { buildBiasCorrectedBacktest } from "./bias-correction";
import { buildDailySignalBacktest } from "./daily-signal";
import type { ForecastDailyPriceRow } from "./types";
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

export function serializeSensitivityParamsKey(params: ForecastModelParams): string {
  const dubai = params.dubai === null ? "none" : `${params.dubai.lagWeeks}:${params.dubai.weight}`;
  const usdKrw = params.usdKrw === null ? "none" : `${params.usdKrw.lagWeeks}:${params.usdKrw.weight}`;

  return [
    params.modelId,
    params.trendLookbackWeeks,
    dubai,
    usdKrw,
    params.externalAdjustmentCapRatio,
    params.biasCorrection === null
      ? "none"
      : `${params.biasCorrection.lookbackWeeks}:${params.biasCorrection.weight}`,
    params.dailySignal === null
      ? "none"
      : `${params.dailySignal.lookbackObservations}:${params.dailySignal.weight}`,
  ].join("|");
}

export interface CreateCandidateEvaluatorInput {
  /** Bias·일별 보정이 없는 기본 params만 실제 walk-forward로 계산한다. */
  evaluate: (params: ForecastModelParams) => RunWalkForwardBacktestResult | null;
  dailyPrices: readonly ForecastDailyPriceRow[];
  recentWindowWeeks: number;
  longWindowWeeks: number;
}

/**
 * 같은 params는 한 번만 walk-forward를 실행하고, Bias·일별 후보는 사후 보정으로 만든다.
 * 민감도 분석과 신호 기여도 분석이 동일한 계산 경로를 공유한다.
 */
export function createCandidateEvaluator({
  evaluate,
  dailyPrices,
  recentWindowWeeks,
  longWindowWeeks,
}: CreateCandidateEvaluatorInput): (params: ForecastModelParams) => RunWalkForwardBacktestResult | null {
  const cache = new Map<string, RunWalkForwardBacktestResult | null>();

  const evaluateCached = (params: ForecastModelParams): RunWalkForwardBacktestResult | null => {
    const key = serializeSensitivityParamsKey(params);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const postCorrected = params.biasCorrection !== null || params.dailySignal !== null;
    let evaluated = postCorrected
      ? evaluateCached({ ...params, biasCorrection: null, dailySignal: null })
      : evaluate(params);

    if (evaluated !== null && params.biasCorrection !== null) {
      evaluated = buildBiasCorrectedBacktest({
        base: evaluated,
        bias: params.biasCorrection,
        recentWindowWeeks,
        longWindowWeeks,
      });
    }

    if (evaluated !== null && params.dailySignal !== null) {
      evaluated = buildDailySignalBacktest({
        base: evaluated,
        dailyPrices,
        signal: params.dailySignal,
        recentWindowWeeks,
        longWindowWeeks,
      });
    }

    cache.set(key, evaluated);

    return evaluated;
  };

  return evaluateCached;
}
