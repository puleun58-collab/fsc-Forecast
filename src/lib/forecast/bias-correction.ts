import {
  BIAS_CORRECTION_LOOKBACK_CANDIDATES,
  BIAS_CORRECTION_WEIGHT_CANDIDATES,
  type ForecastBiasCorrectionParams,
  type ForecastModelParams,
} from "./forecast-model-config";
import { rebuildCandidateBacktest } from "./candidate-backtest";
import {
  resolveForecastDirection,
  type RunWalkForwardBacktestResult,
  type WalkForwardEvaluationPoint,
} from "./run-walk-forward-backtest";

/** Bias 후보를 만들지 판단할 때 보는 최근 다음 주 예측 개수. */
export const BIAS_CANDIDATE_WINDOW_WEEKS = 4;
/** 같은 방향 오차가 이 비율 이상일 때만 편향이 지속된다고 본다. */
export const BIAS_CANDIDATE_MIN_DIRECTION_RATIO = 0.75;

export type BiasDirection = "over-forecast" | "under-forecast" | "none";

export interface BiasState {
  sampleCount: number;
  /** forecast - actual. 양수는 실제보다 높게 예측했다는 뜻이다. */
  meanSignedErrorKrwPerL: number | null;
  sameDirectionRatio: number | null;
  direction: BiasDirection;
  persistent: boolean;
}

function roundMetric(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000;
}

function meanSignedError(points: readonly WalkForwardEvaluationPoint[]): number | null {
  return points.length === 0
    ? null
    : points.reduce((total, point) => total + (point.forecastKrwPerL - point.actualKrwPerL), 0) /
        points.length;
}

/**
 * 최근 다음 주 예측이 한쪽으로 치우쳐 있는지 진단한다.
 * 표시용 정밀도(0.01원/L)에서 의미가 없는 편차는 방향 없음으로 본다.
 */
export function summarizeBiasState(
  oneStepPoints: readonly WalkForwardEvaluationPoint[],
  windowWeeks = BIAS_CANDIDATE_WINDOW_WEEKS,
): BiasState {
  const window = oneStepPoints.filter((point) => point.horizonIndex === 1).slice(-windowWeeks);

  if (window.length === 0) {
    return {
      sampleCount: 0,
      meanSignedErrorKrwPerL: null,
      sameDirectionRatio: null,
      direction: "none",
      persistent: false,
    };
  }

  const mean = meanSignedError(window) ?? 0;
  const rounded = Math.round(mean * 100) / 100;
  const positiveCount = window.filter(
    (point) => point.forecastKrwPerL - point.actualKrwPerL > 0,
  ).length;
  const negativeCount = window.filter(
    (point) => point.forecastKrwPerL - point.actualKrwPerL < 0,
  ).length;
  const sameDirectionRatio = Math.max(positiveCount, negativeCount) / window.length;
  const persistent =
    window.length >= windowWeeks &&
    rounded !== 0 &&
    sameDirectionRatio >= BIAS_CANDIDATE_MIN_DIRECTION_RATIO &&
    (rounded > 0 ? positiveCount >= negativeCount : negativeCount >= positiveCount);

  return {
    sampleCount: window.length,
    meanSignedErrorKrwPerL: roundMetric(mean),
    sameDirectionRatio: roundMetric(sameDirectionRatio),
    direction: rounded === 0 ? "none" : rounded > 0 ? "over-forecast" : "under-forecast",
    persistent,
  };
}

/**
 * 각 origin 시점에서 그 이전에 확정된 다음 주 오차만으로 보정값을 만든다.
 * 최신 편향을 과거 전체에 소급 적용하지 않으므로 미래 데이터 누수가 없다.
 */
export function applyBiasCorrection(
  oneStepPoints: readonly WalkForwardEvaluationPoint[],
  bias: ForecastBiasCorrectionParams,
): WalkForwardEvaluationPoint[] {
  const points = oneStepPoints.filter((point) => point.horizonIndex === 1);

  return points.map((point, index) => {
    const history = points.slice(Math.max(0, index - bias.lookbackWeeks), index);
    const priorBias = history.length < bias.lookbackWeeks ? null : meanSignedError(history);

    if (priorBias === null) {
      return point;
    }

    const forecastKrwPerL = point.forecastKrwPerL - priorBias * bias.weight;
    const absoluteErrorKrwPerL = Math.abs(forecastKrwPerL - point.actualKrwPerL);

    return {
      ...point,
      forecastKrwPerL,
      absoluteErrorKrwPerL,
      absolutePercentageErrorPct:
        point.actualKrwPerL === 0 ? null : (absoluteErrorKrwPerL / point.actualKrwPerL) * 100,
      forecastDirection: resolveForecastDirection(point.anchorKrwPerL, forecastKrwPerL),
    };
  });
}

export interface BuildBiasCorrectedBacktestInput {
  base: RunWalkForwardBacktestResult;
  bias: ForecastBiasCorrectionParams;
  recentWindowWeeks: number;
  longWindowWeeks: number;
}

/**
 * 이미 계산된 walk-forward 결과에 보정을 적용해 후보 성능을 만든다.
 * 새 walk-forward를 실행하지 않으며 기본 모델의 예측 공식도 바꾸지 않는다.
 */
export function buildBiasCorrectedBacktest({
  base,
  bias,
  recentWindowWeeks,
  longWindowWeeks,
}: BuildBiasCorrectedBacktestInput): RunWalkForwardBacktestResult {
  return rebuildCandidateBacktest({
    base,
    params: { ...base.params, biasCorrection: bias },
    oneStepPoints: applyBiasCorrection(base.oneStepPoints, bias),
    recentWindowWeeks,
    longWindowWeeks,
  });
}

export interface BiasCandidateParams {
  label: string;
  params: ForecastModelParams;
}

/** 후보 목록은 미사용(현재 설정)과 lookback × weight 조합만 사용한다. */
export function buildBiasCandidateParams(
  currentParams: ForecastModelParams,
): BiasCandidateParams[] {
  return [
    { label: "미사용", params: { ...currentParams, biasCorrection: null } },
    ...BIAS_CORRECTION_LOOKBACK_CANDIDATES.flatMap((lookbackWeeks) =>
      BIAS_CORRECTION_WEIGHT_CANDIDATES.map((weight) => ({
        label: `최근 ${lookbackWeeks}주 · ${(weight * 100).toFixed(0)}%`,
        params: { ...currentParams, biasCorrection: { lookbackWeeks, weight } },
      })),
    ),
  ];
}

export function describeBiasCorrection(bias: ForecastBiasCorrectionParams | null): string {
  return bias === null ? "미사용" : `최근 ${bias.lookbackWeeks}주 × ${(bias.weight * 100).toFixed(0)}%`;
}
