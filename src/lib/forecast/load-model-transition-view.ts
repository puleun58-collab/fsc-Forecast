import type { ModelTransitionView, TransitionHistoryEntry } from "@/components/admin-model-transition";
import type { PostTransitionView } from "@/components/admin-post-transition";

import { db } from "../db";
import { env } from "../env";
import { FORECAST_MODEL_VERSION } from "./forecast-model-config";
import { resolveForecastModelState } from "./forecast-model-state";
import {
  evaluateRollbackEligibility,
  evaluateTransitionEligibility,
  parseTransitionParams,
} from "./model-transition";
import { readParameterSensitivity } from "./parameter-sensitivity";
import {
  readPostTransitionMonitoring,
  summarizePostTransitionMonitoring,
} from "./post-transition-monitoring";
import { readFscReliabilityTrail } from "../fsc/reliability-trail";
import { readShadowValidation } from "./shadow-validation";

const HISTORY_QUERY_LIMIT = 10;

const ROLLBACK_BLOCK_TEXT: Record<string, string> = {
  sample_not_complete: "전환 후 성능 비교가 아직 완료되지 않았습니다.",
  monitoring_not_reviewable: "현재는 이전 설정이 더 낫다고 판단할 근거가 충분하지 않습니다.",
  current_params_mismatch: "운영 설정이 변경되어 이 비교로는 롤백할 수 없습니다.",
  model_version_mismatch: "예측 모델 버전이 변경되어 이 비교로는 롤백할 수 없습니다.",
  rollback_guardrail_broken: "이전 설정이 최신 비교 분석에서 안정성 기준을 충족하지 못했습니다.",
  cooldown_active: "기존 운영 변경 보호 기간이 남아 있어 지금은 롤백할 수 없습니다.",
  already_approved: "다른 운영 설정 변경이 이미 승인되어 적용을 기다리고 있습니다.",
};

export interface AdminTransitionSection {
  transition: ModelTransitionView;
  postTransition: PostTransitionView | null;
}

/** 관리자 화면은 저장된 metadata와 전환 기록만 읽는다. 여기서 예측 계산을 하지 않는다. */
export async function loadAdminTransitionSection(): Promise<AdminTransitionSection> {
  const [latestRun, transitions, latestFscResult] = await Promise.all([
    db.forecastRun.findFirst({
      where: { status: "succeeded" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, metadata: true },
    }),
    db.forecastModelTransition.findMany({
      where: { datasetKey: env.datasetKey },
      orderBy: [{ approvedAt: "desc" }],
      take: HISTORY_QUERY_LIMIT,
    }),
    db.fscResult.findFirst({
      where: { scenarioName: "base" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { calculationPayload: true },
    }),
  ]);
  const history: TransitionHistoryEntry[] = transitions.map((transition) => ({
    approvedAt: transition.approvedAt.toISOString(),
    appliedAt: transition.appliedAt?.toISOString() ?? null,
    sourceKind: transition.sourceKind,
    status: transition.status,
    baselineParams: parseTransitionParams(transition.baselineParams),
    candidateParams: parseTransitionParams(transition.candidateParams),
  }));
  const modelState = resolveForecastModelState(latestRun?.metadata ?? null);
  const sensitivity = readParameterSensitivity(latestRun?.metadata ?? null);
  const session = readShadowValidation(latestRun?.metadata ?? null);
  const pending = transitions.find((transition) => transition.status === "approved_pending") ?? null;
  const appliedShadowTransition =
    transitions.find(
      (transition) =>
        transition.status === "applied" && transition.sourceKind === "shadow_admin_approved",
    ) ?? null;
  const now = new Date();
  const eligibility =
    session === null
      ? null
      : evaluateTransitionEligibility({
          session,
          currentParams: modelState.params,
          currentPromotedAt: modelState.promotedAt,
          modelVersion: FORECAST_MODEL_VERSION,
          sensitivity,
          hasPendingTransition: pending !== null,
          now,
        });
  const transition: ModelTransitionView =
    pending !== null
      ? {
          status: "approved-pending",
          blockReason: null,
          cooldownRemainingDays: 0,
          baselineParams: parseTransitionParams(pending.baselineParams),
          candidateParams: parseTransitionParams(pending.candidateParams),
          summary: null,
          approvedAt: pending.approvedAt.toISOString(),
          appliedAt: null,
          request: null,
          history,
        }
      : eligibility === null || session === null || latestRun === null
        ? {
            status: "not-ready",
            blockReason: null,
            cooldownRemainingDays: 0,
            baselineParams: modelState.params,
            candidateParams: modelState.params,
            summary: null,
            approvedAt: null,
            appliedAt: null,
            request: null,
            history,
          }
        : {
            status:
              eligibility.eligible
                ? "approvable"
                : eligibility.blockReason === "shadow_not_reviewable" ||
                    eligibility.blockReason === "sample_not_complete" ||
                    eligibility.blockReason === "candidate_equals_baseline"
                  ? "not-ready"
                  : "blocked",
            blockReason: eligibility.blockReason,
            cooldownRemainingDays: eligibility.cooldownRemainingDays,
            baselineParams: session.baselineParams,
            candidateParams: session.candidateParams,
            summary: eligibility.summary,
            approvedAt: null,
            appliedAt: null,
            request: {
              shadowSessionId: session.sessionId,
              candidateFingerprint: eligibility.candidateFingerprint,
              sourceForecastRunId: latestRun.id,
            },
            history,
          };
  const monitoring = readPostTransitionMonitoring(latestRun?.metadata ?? null);

  if (monitoring === null || latestRun === null) {
    return { transition, postTransition: null };
  }

  const rollback = evaluateRollbackEligibility({
    monitoring,
    currentParams: modelState.params,
    currentPromotedAt: modelState.promotedAt,
    modelVersion: FORECAST_MODEL_VERSION,
    sensitivity,
    hasPendingTransition: pending !== null,
    now,
  });
  const summary = summarizePostTransitionMonitoring(monitoring);
  const showBlockText =
    summary.status === "rollback_reviewable" && !rollback.eligible && rollback.blockReason !== null;
  // 조기 경고는 새 임계값 없이 기존 신뢰도 guardrail 신호만 재사용한다.
  const earlyWarning =
    summary.status === "monitoring" &&
    readFscReliabilityTrail(latestFscResult?.calculationPayload ?? null).recent4wErrorTrend ===
      "worsening"
      ? "최근 오차 추세 확인이 필요합니다. 아직 이전 설정과의 우열을 판정할 표본은 아닙니다."
      : null;

  return {
    transition:
      appliedShadowTransition === null || pending !== null || transition.status !== "not-ready"
        ? transition
        : {
            ...transition,
            status: "applied",
            baselineParams: parseTransitionParams(appliedShadowTransition.baselineParams),
            candidateParams: parseTransitionParams(appliedShadowTransition.candidateParams),
            appliedAt: appliedShadowTransition.appliedAt?.toISOString() ?? null,
          },
    postTransition: {
      monitoring,
      summary,
      rollbackApprovable: rollback.eligible,
      rollbackBlockedText: showBlockText ? ROLLBACK_BLOCK_TEXT[rollback.blockReason ?? ""] ?? null : null,
      earlyWarningText: earlyWarning,
      request: rollback.eligible
        ? {
            sourceTransitionId: monitoring.sourceTransitionId,
            sourceForecastRunId: latestRun.id,
            rollbackFingerprint: rollback.rollbackFingerprint,
          }
        : null,
    },
  };
}
