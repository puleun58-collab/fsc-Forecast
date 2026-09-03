import {
  PROMOTION_COOLDOWN_DAYS,
  PROMOTION_LONG_WINDOW_TOLERANCE_RATIO,
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_VOLATILITY_TOLERANCE_RATIO,
} from "./forecast-model-config";
import type {
  RunWalkForwardBacktestResult,
  WalkForwardWindowMetrics,
} from "./run-walk-forward-backtest";

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

interface QualityWindows {
  recent: WalkForwardWindowMetrics;
  long: WalkForwardWindowMetrics;
}

function evaluateQualityWindows(
  current: QualityWindows,
  candidate: QualityWindows,
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

/**
 * 모델 승격 기준. 1~13주 전체 예측 성능을 사용하며 Model A/B/C 자동 선택 의미를 유지한다.
 */
export function evaluatePromotionQuality(
  current: Pick<RunWalkForwardBacktestResult, "recent" | "long">,
  candidate: Pick<RunWalkForwardBacktestResult, "recent" | "long">,
): PromotionQualityChecks {
  return evaluateQualityWindows(current, candidate);
}

/**
 * 튜닝 후보는 정렬·표시와 같은 다음 주 예측 성능으로 판정한다.
 * 임계값은 승격 기준과 동일하고 적용 구간만 one-step이다.
 */
export function evaluateTuningCandidateQuality(
  current: Pick<RunWalkForwardBacktestResult, "recentOneStep" | "longOneStep">,
  candidate: Pick<RunWalkForwardBacktestResult, "recentOneStep" | "longOneStep">,
): PromotionQualityChecks {
  return evaluateQualityWindows(
    { recent: current.recentOneStep, long: current.longOneStep },
    { recent: candidate.recentOneStep, long: candidate.longOneStep },
  );
}
