import type { ShadowValidationSession } from "./shadow-validation";

/** 이 개수보다 적은 신규 Actual로는 성능 기반 중도중단을 판단하지 않는다. */
export const SHADOW_MIN_OBSERVATION_COUNT = 4;
/** 운영 모델 누적 MAE 대비 상대 악화 기준. */
export const SHADOW_DEGRADATION_RELATIVE_RATIO = 0.2;
/** 같은 시점에 함께 요구하는 절대 악화 기준(원/L). */
export const SHADOW_DEGRADATION_ABSOLUTE_KRW_PER_L = 5;
/** 악화가 이만큼 연속으로 확인되어야 중도중단 조건을 충족한다. */
export const SHADOW_DEGRADATION_REQUIRED_COUNT = 2;

export type ShadowDegradationStatus =
  | "insufficient-samples"
  | "stable"
  | "watch"
  | "stop-recommended";

export interface ShadowDegradation {
  status: ShadowDegradationStatus;
  /** 확정된 신규 Actual 개수. */
  sampleCount: number;
  minSampleCount: number;
  /** Shadow 시작 이후 신규 Actual에 대한 누적 절대오차 평균. */
  shadowCumulativeMaeKrwPerL: number | null;
  /** 같은 구간의 운영 모델 누적 MAE. */
  baselineCumulativeMaeKrwPerL: number | null;
  /** 운영 모델 대비 상대 차이. 양수면 Shadow가 더 나쁘다. */
  relativeGapRatio: number | null;
  /** 같은 비교의 절대 차이(원/L). */
  absoluteGapKrwPerL: number | null;
  confirmedCount: number;
  requiredCount: number;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isDegraded(baselineMae: number | null, shadowMae: number | null): boolean {
  if (baselineMae === null || shadowMae === null || baselineMae <= 0) {
    return false;
  }

  const absoluteGap = shadowMae - baselineMae;

  return (
    absoluteGap / baselineMae >= SHADOW_DEGRADATION_RELATIVE_RATIO &&
    absoluteGap >= SHADOW_DEGRADATION_ABSOLUTE_KRW_PER_L
  );
}

/**
 * Shadow 시작 이후 누적 MAE를 운영 모델과 같은 구간으로 비교한다.
 * 최소 관찰 개수를 채운 시점부터 주차별 누적값을 다시 계산해,
 * 마지막 주차부터 이어지는 악화 횟수만 센다. 기준을 벗어나면 카운트는 0으로 돌아간다.
 */
export function evaluateShadowDegradation(
  session: ShadowValidationSession | null,
): ShadowDegradation | null {
  if (session === null) {
    return null;
  }

  const completed = session.observations
    .filter(
      (observation) =>
        observation.actualKrwPerL !== null &&
        observation.baselineAbsoluteErrorKrwPerL !== null &&
        observation.shadowAbsoluteErrorKrwPerL !== null,
    )
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate));
  const baselineErrors = completed.map(
    (observation) => observation.baselineAbsoluteErrorKrwPerL as number,
  );
  const shadowErrors = completed.map(
    (observation) => observation.shadowAbsoluteErrorKrwPerL as number,
  );
  const baselineCumulativeMaeKrwPerL = mean(baselineErrors);
  const shadowCumulativeMaeKrwPerL = mean(shadowErrors);
  const absoluteGapKrwPerL =
    baselineCumulativeMaeKrwPerL === null || shadowCumulativeMaeKrwPerL === null
      ? null
      : shadowCumulativeMaeKrwPerL - baselineCumulativeMaeKrwPerL;
  const relativeGapRatio =
    absoluteGapKrwPerL === null ||
    baselineCumulativeMaeKrwPerL === null ||
    baselineCumulativeMaeKrwPerL <= 0
      ? null
      : absoluteGapKrwPerL / baselineCumulativeMaeKrwPerL;

  if (completed.length < SHADOW_MIN_OBSERVATION_COUNT) {
    return {
      status: "insufficient-samples",
      sampleCount: completed.length,
      minSampleCount: SHADOW_MIN_OBSERVATION_COUNT,
      shadowCumulativeMaeKrwPerL,
      baselineCumulativeMaeKrwPerL,
      relativeGapRatio,
      absoluteGapKrwPerL,
      confirmedCount: 0,
      requiredCount: SHADOW_DEGRADATION_REQUIRED_COUNT,
    };
  }

  let confirmedCount = 0;

  for (let size = completed.length; size >= SHADOW_MIN_OBSERVATION_COUNT; size -= 1) {
    const degraded = isDegraded(
      mean(baselineErrors.slice(0, size)),
      mean(shadowErrors.slice(0, size)),
    );

    if (!degraded) {
      break;
    }

    confirmedCount += 1;

    if (confirmedCount >= SHADOW_DEGRADATION_REQUIRED_COUNT) {
      break;
    }
  }

  const status: ShadowDegradationStatus =
    confirmedCount >= SHADOW_DEGRADATION_REQUIRED_COUNT
      ? "stop-recommended"
      : confirmedCount > 0
        ? "watch"
        : "stable";

  return {
    status,
    sampleCount: completed.length,
    minSampleCount: SHADOW_MIN_OBSERVATION_COUNT,
    shadowCumulativeMaeKrwPerL,
    baselineCumulativeMaeKrwPerL,
    relativeGapRatio,
    absoluteGapKrwPerL,
    confirmedCount,
    requiredCount: SHADOW_DEGRADATION_REQUIRED_COUNT,
  };
}
