import {
  PROMOTION_COOLDOWN_DAYS,
  PROMOTION_LONG_WINDOW_TOLERANCE_RATIO,
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_VOLATILITY_TOLERANCE_RATIO,
} from "./forecast-model-config";
import type { RunWalkForwardBacktestResult } from "./run-walk-forward-backtest";

const DAY_MS = 86_400_000;

export interface PromotionCooldownState {
  elapsed: boolean;
  remainingDays: number;
}

/** 자동 승격과 관리자 전환 승인이 같은 보호 기간을 사용하도록 공유한다. */
export function evaluatePromotionCooldown(
  promotedAt: Date | null,
  now: Date,
): PromotionCooldownState {
  if (promotedAt === null) {
    return { elapsed: true, remainingDays: 0 };
  }

  const elapsedMs = now.getTime() - promotedAt.getTime();
  const cooldownMs = PROMOTION_COOLDOWN_DAYS * DAY_MS;

  return {
    elapsed: elapsedMs >= cooldownMs,
    remainingDays: elapsedMs >= cooldownMs ? 0 : Math.ceil((cooldownMs - elapsedMs) / DAY_MS),
  };
}

export interface PromotionQualityChecks {
  maeImprovementRatio: number | null;
  mapeImprovementPctPoint: number | null;
  meetsMinimumImprovement: boolean;
  longStable: boolean;
  maxErrorStable: boolean;
  churnStable: boolean;
}

/**
 * 모델 승격에 쓰는 품질 기준을 한 곳에서 계산한다.
 * 승격 판단과 관리자 진단이 서로 다른 임계값을 쓰지 않도록 공유한다.
 */
export function evaluatePromotionQuality(
  current: Pick<RunWalkForwardBacktestResult, "recent" | "long">,
  candidate: Pick<RunWalkForwardBacktestResult, "recent" | "long">,
): PromotionQualityChecks {
  const currentMae = current.recent.maeKrwPerL;
  const currentMape = current.recent.mapePct;
  const candidateMae = candidate.recent.maeKrwPerL;
  const candidateMape = candidate.recent.mapePct;
  const maeImprovementRatio =
    currentMae === null || currentMae === 0 || candidateMae === null
      ? null
      : (currentMae - candidateMae) / currentMae;
  const mapeImprovementPctPoint =
    currentMape === null || candidateMape === null ? null : currentMape - candidateMape;

  return {
    maeImprovementRatio,
    mapeImprovementPctPoint,
    meetsMinimumImprovement:
      (maeImprovementRatio !== null && maeImprovementRatio >= PROMOTION_MIN_MAE_IMPROVEMENT_RATIO) ||
      (mapeImprovementPctPoint !== null &&
        mapeImprovementPctPoint >= PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT),
    longStable:
      current.long.maeKrwPerL === null ||
      candidate.long.maeKrwPerL === null ||
      candidate.long.maeKrwPerL <= current.long.maeKrwPerL * PROMOTION_LONG_WINDOW_TOLERANCE_RATIO,
    maxErrorStable:
      current.recent.maxAbsoluteErrorKrwPerL === null ||
      candidate.recent.maxAbsoluteErrorKrwPerL === null ||
      candidate.recent.maxAbsoluteErrorKrwPerL <=
        current.recent.maxAbsoluteErrorKrwPerL * PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
    churnStable:
      current.recent.forecastChurnKrwPerL === null ||
      candidate.recent.forecastChurnKrwPerL === null ||
      candidate.recent.forecastChurnKrwPerL <=
        current.recent.forecastChurnKrwPerL * PROMOTION_VOLATILITY_TOLERANCE_RATIO,
  };
}
