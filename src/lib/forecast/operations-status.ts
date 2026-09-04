import type { ForecastInputQuality } from "./input-quality";
import type { IntervalForwardValidation } from "./interval-forward-validation";
import { summarizeIntervalForwardValidation } from "./interval-forward-validation";
import type { CandidatePersistence } from "./candidate-persistence";
import type { HorizonPerformance } from "./horizon-performance";
import type { PerformanceDrift } from "./performance-drift";
import type { SignalReviewDecision } from "./signal-review";
import { summarizeShadowValidation, type ShadowValidationSession } from "./shadow-validation";

export type OperationsStatus = "healthy" | "watch" | "attention" | "action-required" | "unknown";

export type OperationsItemSource =
  | "input-quality"
  | "transition"
  | "rollback"
  | "performance-drift"
  | "shadow"
  | "tuning"
  | "signal-review"
  | "prediction-interval"
  | "horizon";

export interface OperationsStatusItem {
  key: string;
  severity: Exclude<OperationsStatus, "unknown">;
  title: string;
  detail: string;
  source: OperationsItemSource;
}

export type OperationsStageKey = "candidate" | "shadow" | "transition";

export interface OperationsStageStep {
  key: OperationsStageKey;
  label: string;
  /** 지금 진행 중인 단계 하나만 true다. */
  current: boolean;
}

export interface OperationsStatusCenter {
  status: OperationsStatus;
  /** 조치가 필요할 때 가장 먼저 볼 항목 하나. */
  primaryAction: OperationsStatusItem | null;
  items: OperationsStatusItem[];
  observations: OperationsStatusItem[];
  /** 후보 확인 → Shadow → 운영 전환 흐름. 기존 상태를 옮겨 적기만 한다. */
  stages: OperationsStageStep[];
}

/** 확인 순서: 입력 데이터 → 관리자 조치 → 성능 → 검증 → 참고. */
const SOURCE_ORDER: readonly OperationsItemSource[] = [
  "input-quality",
  "rollback",
  "transition",
  "performance-drift",
  "shadow",
  "tuning",
  "signal-review",
  "prediction-interval",
  "horizon",
];

const SEVERITY_RANK: Record<Exclude<OperationsStatus, "unknown">, number> = {
  "action-required": 0,
  attention: 1,
  watch: 2,
  healthy: 3,
};

export interface BuildOperationsStatusCenterInput {
  hasForecastRun: boolean;
  inputQuality: ForecastInputQuality | null;
  performanceDrift: PerformanceDrift | null;
  persistence: CandidatePersistence | null;
  shadow: ShadowValidationSession | null;
  transitionStatus: "not-ready" | "blocked" | "approvable" | "approved-pending" | "applied" | null;
  rollbackReviewable: boolean;
  signalReview: readonly SignalReviewDecision[];
  horizonPerformance: HorizonPerformance | null;
  intervalForward: IntervalForwardValidation | null;
  /** UI 표기용 이름. 파라미터 문자열은 호출부의 공통 formatter 결과를 그대로 받는다. */
  topCandidateLabel: string | null;
}

function buildStages({
  persistence,
  shadow,
  transitionStatus,
}: Pick<
  BuildOperationsStatusCenterInput,
  "persistence" | "shadow" | "transitionStatus"
>): OperationsStageStep[] {
  const shadowSummary = shadow === null ? null : summarizeShadowValidation(shadow);
  const shadowRunning = shadowSummary?.status === "validating";
  const transitionReady = shadowSummary?.status === "reviewable" || transitionStatus === "approvable";
  const candidateConfirming =
    !shadowRunning &&
    !transitionReady &&
    persistence !== null &&
    persistence.candidateFingerprint !== null;

  return [
    {
      key: "candidate",
      label:
        persistence === null || persistence.candidateFingerprint === null
          ? "동일 후보 확인 대기"
          : `동일 후보 확인 ${persistence.confirmedCount}/${persistence.requiredCount}`,
      current: candidateConfirming,
    },
    {
      key: "shadow",
      label:
        shadowSummary === null
          ? "Shadow 대기"
          : `Shadow ${shadowSummary.completedSampleCount}/${shadowSummary.requiredSampleCount}`,
      current: shadowRunning,
    },
    {
      key: "transition",
      label: transitionReady ? "운영 전환 검토" : "운영 전환 대기",
      current: transitionReady,
    },
  ];
}

const SIGNAL_LABEL: Record<string, string> = {
  trend: "추세",
  dubai: "Dubai",
  usdKrw: "USD/KRW",
  bias: "편향 보정",
  dailySignal: "일별 단기 신호",
};

/**
 * 이미 계산된 진단 상태를 모아 확인 순서만 정리한다.
 * 새 기준을 만들지 않고 어떤 운영 값도 바꾸지 않는다.
 */
export function buildOperationsStatusCenter({
  hasForecastRun,
  inputQuality,
  performanceDrift,
  persistence,
  shadow,
  transitionStatus,
  rollbackReviewable,
  signalReview,
  horizonPerformance,
  intervalForward,
  topCandidateLabel,
}: BuildOperationsStatusCenterInput): OperationsStatusCenter {
  if (!hasForecastRun) {
    return { status: "unknown", primaryAction: null, items: [], observations: [], stages: [] };
  }

  const items: OperationsStatusItem[] = [];

  if (inputQuality !== null && inputQuality.level !== "ok") {
    const degraded = inputQuality.results.filter((result) => !result.usable);

    items.push({
      key: "input-quality",
      severity: inputQuality.level === "action-required" ? "action-required" : "attention",
      title:
        inputQuality.level === "action-required"
          ? "입력 데이터 확인 필요"
          : "입력 데이터 일부 미사용",
      detail:
        degraded.length === 0
          ? "이번 예측의 입력 데이터 상태를 확인하세요."
          : `${degraded.map((result) => result.source).join(", ")} 상태를 먼저 확인하세요. 성능 판단 전에 입력 데이터를 확인합니다.`,
      source: "input-quality",
    });
  }

  if (rollbackReviewable) {
    items.push({
      key: "rollback",
      severity: "action-required",
      title: "Rollback 검토 필요",
      detail: "운영 전환 후 성능이 이전 설정보다 나빠 롤백 승인 여부를 확인해야 합니다.",
      source: "rollback",
    });
  }

  if (transitionStatus === "approvable") {
    items.push({
      key: "transition-approvable",
      severity: "action-required",
      title: "운영 전환 승인 대기",
      detail: "Shadow 검증을 통과한 후보가 관리자 승인을 기다리고 있습니다.",
      source: "transition",
    });
  }

  if (transitionStatus === "approved-pending") {
    items.push({
      key: "transition-pending",
      severity: "watch",
      title: "전환 적용 대기",
      detail: "승인된 전환이 다음 예측 실행에서 적용됩니다.",
      source: "transition",
    });
  }

  if (performanceDrift !== null && performanceDrift.status !== "stable") {
    const severity = performanceDrift.status === "alert" ? "attention" : "watch";

    items.push({
      key: "performance-drift",
      severity: performanceDrift.status === "undecided" ? "watch" : severity,
      title:
        performanceDrift.status === "alert"
          ? "최근 Forecast 성능 악화"
          : performanceDrift.status === "watch"
            ? "최근 Forecast 오차 상승"
            : "성능 변화 판단 보류",
      detail:
        performanceDrift.status === "undecided"
          ? "최근 실제 데이터가 부족해 성능 변화 판단을 보류합니다."
          : `최근 4주 MAE ${performanceDrift.short.maeKrwPerL ?? "-"} · 최근 13주 MAE ${performanceDrift.medium.maeKrwPerL ?? "-"}${
              inputQuality !== null && inputQuality.level !== "ok"
                ? " · 입력 데이터 이상이 함께 감지되었습니다."
                : ""
            }`,
      source: "performance-drift",
    });
  }

  if (shadow !== null) {
    const summary = summarizeShadowValidation(shadow);

    if (summary.status === "validating") {
      items.push({
        key: "shadow-progress",
        severity: "watch",
        title: `Shadow 검증 ${summary.completedSampleCount}/${summary.requiredSampleCount}주`,
        detail: "후보 설정을 새 실제 데이터로 검증하고 있습니다.",
        source: "shadow",
      });
    }

    if (summary.status === "reviewable") {
      items.push({
        key: "shadow-reviewable",
        severity: "action-required",
        title: "Shadow 검증 완료 · 운영 전환 검토 가능",
        detail: "검증을 통과한 후보가 있으며 운영 적용은 관리자 승인이 필요합니다.",
        source: "shadow",
      });
    }

    if (summary.status === "failed" || summary.status === "stopped") {
      items.push({
        key: "shadow-failed",
        severity: "watch",
        title: "Shadow 검증 미통과",
        detail: "현재 운영 모델을 유지합니다. 추가 조치는 필요하지 않습니다.",
        source: "shadow",
      });
    }
  }

  // Shadow 진행 중에는 후보 확인 문구를 중복해서 올리지 않는다.
  const shadowRunning = items.some((item) => item.key === "shadow-progress");

  if (!shadowRunning && persistence !== null && persistence.candidateFingerprint !== null) {
    items.push({
      key: "candidate-persistence",
      severity: "watch",
      title: `동일 후보 확인 ${persistence.confirmedCount}/${persistence.requiredCount}주`,
      detail:
        topCandidateLabel === null
          ? "같은 후보가 새 주간 데이터에서 한 번 더 통과하면 Shadow 검증을 시작합니다."
          : `${topCandidateLabel} · 같은 후보가 한 번 더 통과하면 Shadow 검증을 시작합니다.`,
      source: "tuning",
    });
  }

  const removalReview = signalReview.filter((decision) => decision.status === "review-removal");

  if (removalReview.length > 0) {
    items.push({
      key: "signal-review",
      severity: "attention",
      title: "신호 확인",
      detail: `${removalReview
        .map((decision) => SIGNAL_LABEL[decision.signal] ?? decision.signal)
        .join(", ")} · 축소·제거 검토 상태입니다.`,
      source: "signal-review",
    });
  }

  const intervalSummaries = summarizeIntervalForwardValidation(intervalForward);
  const narrowIntervals = intervalSummaries.filter((summary) => summary.status === "too-narrow");
  const validatingIntervals = intervalSummaries.filter(
    (summary) => summary.status === "validating" || summary.status === "insufficient-sample",
  );

  if (narrowIntervals.length > 0) {
    items.push({
      key: "interval-too-narrow",
      severity: "attention",
      title: "예측 범위 확인",
      detail: `${narrowIntervals
        .map((summary) => `${summary.horizonWeeks}주 후`)
        .join(", ")} 실제 적중률이 목표보다 낮습니다. 중심 예측값 문제와는 별개입니다.`,
      source: "prediction-interval",
    });
  }

  if (validatingIntervals.length > 0) {
    items.push({
      key: "interval-validating",
      severity: "watch",
      title: "예측 범위 검증 중",
      detail: `${validatingIntervals
        .map((summary) => `${summary.horizonWeeks}주 후`)
        .join(", ")} 실전 표본을 모으는 중입니다.`,
      source: "prediction-interval",
    });
  }

  if (
    horizonPerformance !== null &&
    horizonPerformance.degradationStartHorizonWeeks !== null
  ) {
    items.push({
      key: "horizon-degradation",
      severity: "watch",
      title: "장기 예측 참고",
      detail: `${horizonPerformance.degradationStartHorizonWeeks}주 이후 예측 오차가 커집니다.`,
      source: "horizon",
    });
  }

  const sorted = [...items].sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      SOURCE_ORDER.indexOf(left.source) - SOURCE_ORDER.indexOf(right.source),
  );
  const actionable = sorted.filter((item) => item.severity !== "watch");
  const status: OperationsStatus =
    sorted.length === 0
      ? "healthy"
      : sorted.some((item) => item.severity === "action-required")
        ? "action-required"
        : sorted.some((item) => item.severity === "attention")
          ? "attention"
          : "watch";

  return {
    status,
    primaryAction: actionable[0] ?? null,
    items: actionable,
    observations: sorted.filter((item) => item.severity === "watch"),
    stages: buildStages({ persistence, shadow, transitionStatus }),
  };
}
