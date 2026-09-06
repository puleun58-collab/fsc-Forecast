import { buildCandidateFingerprint, type ShadowCandidateInput } from "./shadow-validation";
import type { ForecastModelParams } from "./forecast-model-config";

/** 후보 교체에 필요한 최근 13주 MAE 상대 개선폭. 노이즈 수준 차이로는 바꾸지 않는다. */
export const CANDIDATE_SWITCH_MIN_IMPROVEMENT_RATIO = 0.05;
/** 상대 개선과 함께 요구하는 절대 개선폭. */
export const CANDIDATE_SWITCH_MIN_IMPROVEMENT_KRW_PER_L = 0.5;

export type CandidateSwitchReason =
  | "no-tracked-candidate"
  | "tracked-candidate-kept"
  | "tracked-candidate-unqualified"
  | "significant-improvement"
  | "no-candidate";

export interface TrackedCandidateDecision {
  candidate: ShadowCandidateInput | null;
  reason: CandidateSwitchReason;
  /** 교체 판단에 사용한 현재 후보 대비 상대 개선율. 비교 불가면 null. */
  maeImprovementRatio: number | null;
  /** 같은 비교의 절대 개선폭(원/L). */
  maeImprovementKrwPerL: number | null;
}

function findByFingerprint(
  candidates: readonly ShadowCandidateInput[],
  fingerprint: string,
  modelVersion: string,
): ShadowCandidateInput | null {
  return (
    candidates.find(
      (candidate) => buildCandidateFingerprint(candidate.params, modelVersion) === fingerprint,
    ) ?? null
  );
}

/** Shadow가 실제로 받아들일 수 있는 1순위 후보. 운영 설정과 같은 후보는 제외한다. */
export function selectRawTopCandidate(
  candidates: readonly ShadowCandidateInput[],
  baselineParams: ForecastModelParams,
  modelVersion: string,
): ShadowCandidateInput | null {
  const baselineFingerprint = buildCandidateFingerprint(baselineParams, modelVersion);

  return (
    candidates.find(
      (candidate) =>
        candidate.meetsPromotionQuality &&
        buildCandidateFingerprint(candidate.params, modelVersion) !== baselineFingerprint,
    ) ?? null
  );
}

export interface ResolveTrackedCandidateInput {
  /** 직전 run에서 연속 확인 중이던 후보의 fingerprint. */
  trackedFingerprint: string | null;
  candidates: readonly ShadowCandidateInput[];
  baselineParams: ForecastModelParams;
  modelVersion: string;
}

/**
 * Raw 1순위가 바뀌었다는 이유만으로 연속 확인 후보를 교체하지 않는다.
 * 최근 13주 MAE가 상대 5% 이상 · 절대 0.5원/L 이상 좋아질 때만 교체하고,
 * 현재 후보가 품질 기준에서 탈락하면 개선폭과 무관하게 즉시 교체한다.
 */
export function resolveTrackedCandidate({
  trackedFingerprint,
  candidates,
  baselineParams,
  modelVersion,
}: ResolveTrackedCandidateInput): TrackedCandidateDecision {
  const rawTop = selectRawTopCandidate(candidates, baselineParams, modelVersion);

  if (rawTop === null) {
    return {
      candidate: null,
      reason: "no-candidate",
      maeImprovementRatio: null,
      maeImprovementKrwPerL: null,
    };
  }

  if (trackedFingerprint === null) {
    return {
      candidate: rawTop,
      reason: "no-tracked-candidate",
      maeImprovementRatio: null,
      maeImprovementKrwPerL: null,
    };
  }

  const baselineFingerprint = buildCandidateFingerprint(baselineParams, modelVersion);
  const tracked =
    trackedFingerprint === baselineFingerprint
      ? null
      : findByFingerprint(candidates, trackedFingerprint, modelVersion);

  if (tracked === null || !tracked.meetsPromotionQuality) {
    // 현재 후보가 사라졌거나 품질 기준을 벗어난 경우에는 최소 개선폭을 적용하지 않는다.
    return {
      candidate: rawTop,
      reason: "tracked-candidate-unqualified",
      maeImprovementRatio: null,
      maeImprovementKrwPerL: null,
    };
  }

  if (buildCandidateFingerprint(rawTop.params, modelVersion) === trackedFingerprint) {
    return {
      candidate: tracked,
      reason: "tracked-candidate-kept",
      maeImprovementRatio: null,
      maeImprovementKrwPerL: null,
    };
  }

  const trackedMae = tracked.recentOneStepMaeKrwPerL ?? null;
  const rawMae = rawTop.recentOneStepMaeKrwPerL ?? null;

  if (trackedMae === null || rawMae === null || trackedMae <= 0) {
    // 비교할 성능이 없으면 현재 후보를 유지한다. 교체는 근거가 있을 때만 한다.
    return {
      candidate: tracked,
      reason: "tracked-candidate-kept",
      maeImprovementRatio: null,
      maeImprovementKrwPerL: null,
    };
  }

  const maeImprovementKrwPerL = trackedMae - rawMae;
  const maeImprovementRatio = maeImprovementKrwPerL / trackedMae;
  const significant =
    maeImprovementRatio >= CANDIDATE_SWITCH_MIN_IMPROVEMENT_RATIO &&
    maeImprovementKrwPerL >= CANDIDATE_SWITCH_MIN_IMPROVEMENT_KRW_PER_L;

  return {
    candidate: significant ? rawTop : tracked,
    reason: significant ? "significant-improvement" : "tracked-candidate-kept",
    maeImprovementRatio,
    maeImprovementKrwPerL,
  };
}
