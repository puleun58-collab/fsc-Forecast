import {
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_MIN_SAMPLE_COUNT,
} from "./forecast-model-config";
import type { PromotionQualityChecks } from "./promotion-quality";

export type CandidateDecisionStatus =
  | "current"
  | "top"
  | "eligible"
  | "rejected"
  | "not-evaluable";

export type CandidateDecisionReason =
  | "minimum-improvement"
  | "long-mae"
  | "max-error"
  | "churn"
  | "insufficient-sample";

export interface CandidateDecision {
  status: CandidateDecisionStatus;
  /** 실패한 기준만 담는다. 통과 후보는 비어 있다. */
  reasons: CandidateDecisionReason[];
  /** 튜닝 후보 목록에서의 순위(1부터). 목록 밖이면 null. */
  rank: number | null;
  /** 최소 개선 기준을 통과시킨 지표. 통과하지 못했으면 null. */
  improvementBasis: "mae" | "mape" | null;
}

export interface DescribeTuningCandidateDecisionInput {
  isCurrent: boolean;
  qualityChecks: PromotionQualityChecks | null;
  sampleCount: number;
  /** 튜닝 후보 목록에서 찾은 순위. 없으면 null. */
  rank: number | null;
}

function resolveImprovementBasis(
  checks: PromotionQualityChecks,
): CandidateDecision["improvementBasis"] {
  if (
    checks.maeImprovementRatio !== null &&
    checks.maeImprovementRatio >= PROMOTION_MIN_MAE_IMPROVEMENT_RATIO
  ) {
    return "mae";
  }

  if (
    checks.mapeImprovementPctPoint !== null &&
    checks.mapeImprovementPctPoint >= PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT
  ) {
    return "mape";
  }

  return null;
}

/**
 * 저장된 품질 판정 결과를 화면용 상태로 옮기기만 한다.
 * 기준을 다시 계산하지 않으므로 UI 설명과 실제 후보 선정 결과가 어긋날 수 없다.
 */
export function describeTuningCandidateDecision({
  isCurrent,
  qualityChecks,
  sampleCount,
  rank,
}: DescribeTuningCandidateDecisionInput): CandidateDecision {
  if (isCurrent) {
    return { status: "current", reasons: [], rank: null, improvementBasis: null };
  }

  if (sampleCount < PROMOTION_MIN_SAMPLE_COUNT || qualityChecks === null) {
    return {
      status: "not-evaluable",
      reasons: ["insufficient-sample"],
      rank: null,
      improvementBasis: null,
    };
  }

  const reasons: CandidateDecisionReason[] = [
    ...(qualityChecks.meetsMinimumImprovement ? [] : (["minimum-improvement"] as const)),
    ...(qualityChecks.longStable ? [] : (["long-mae"] as const)),
    ...(qualityChecks.maxErrorStable ? [] : (["max-error"] as const)),
    ...(qualityChecks.churnStable ? [] : (["churn"] as const)),
  ];
  const improvementBasis = resolveImprovementBasis(qualityChecks);

  if (reasons.length > 0) {
    return { status: "rejected", reasons, rank: null, improvementBasis };
  }

  return {
    status: rank === 1 ? "top" : "eligible",
    reasons: [],
    rank,
    improvementBasis,
  };
}
