import { z } from "zod";

import { ForecastModelParamsSchema, type ForecastModelParams } from "./forecast-model-config";
import type { ParameterSensitivity } from "./parameter-sensitivity";
import {
  summarizePostTransitionMonitoring,
  type PostTransitionMonitoring,
  type PostTransitionSummary,
} from "./post-transition-monitoring";
import { evaluatePromotionCooldown } from "./promotion-quality";
import {
  buildCandidateFingerprint,
  summarizeShadowValidation,
  type ShadowValidationSession,
  type ShadowValidationSummary,
} from "./shadow-validation";

const ModelParamsSchema = ForecastModelParamsSchema;

/** 저장된 전환 params는 항상 schema 검증 후 사용한다. */
export function parseTransitionParams(value: unknown): ForecastModelParams {
  return ModelParamsSchema.parse(value);
}

export type TransitionBlockReason =
  | "shadow_not_reviewable"
  | "sample_not_complete"
  | "baseline_mismatch"
  | "model_version_mismatch"
  | "candidate_equals_baseline"
  | "candidate_guardrail_broken"
  | "cooldown_active"
  | "already_approved";

export interface TransitionEligibility {
  eligible: boolean;
  blockReason: TransitionBlockReason | null;
  cooldownRemainingDays: number;
  candidateFingerprint: string;
  baselineFingerprint: string;
  summary: ShadowValidationSummary;
}

export interface EvaluateTransitionEligibilityInput {
  session: ShadowValidationSession;
  currentParams: ForecastModelParams;
  currentPromotedAt: Date | null;
  modelVersion: string;
  sensitivity: ParameterSensitivity | null;
  hasPendingTransition: boolean;
  now: Date;
}

/**
 * Shadow 결과와 기존 승격 guardrail만으로 운영 전환 가능 여부를 판단한다.
 * 새로운 임계값을 만들지 않고 이미 계산된 판정 결과를 재확인한다.
 */
export function evaluateTransitionEligibility({
  session,
  currentParams,
  currentPromotedAt,
  modelVersion,
  sensitivity,
  hasPendingTransition,
  now,
}: EvaluateTransitionEligibilityInput): TransitionEligibility {
  const summary = summarizeShadowValidation(session);
  const candidateFingerprint = buildCandidateFingerprint(session.candidateParams, modelVersion);
  const baselineFingerprint = buildCandidateFingerprint(currentParams, modelVersion);
  const cooldown = evaluatePromotionCooldown(currentPromotedAt, now);
  const guardrailBroken = isSensitivityGuardrailBroken(sensitivity, candidateFingerprint, modelVersion);
  const blockReason: TransitionBlockReason | null =
    session.baselineModelVersion !== modelVersion
      ? "model_version_mismatch"
      : buildCandidateFingerprint(session.baselineParams, modelVersion) !== baselineFingerprint
        ? "baseline_mismatch"
        : candidateFingerprint === baselineFingerprint
          ? "candidate_equals_baseline"
          : summary.completedSampleCount < summary.requiredSampleCount
            ? "sample_not_complete"
            : summary.status !== "reviewable"
              ? "shadow_not_reviewable"
              : guardrailBroken
                ? "candidate_guardrail_broken"
                : hasPendingTransition
                  ? "already_approved"
                  : !cooldown.elapsed
                    ? "cooldown_active"
                    : null;

  return {
    eligible: blockReason === null,
    blockReason,
    cooldownRemainingDays: cooldown.remainingDays,
    candidateFingerprint,
    baselineFingerprint,
    summary,
  };
}

/**
 * 최신 민감도 진단에서 같은 설정이 장기 안정성 기준을 깨뜨렸는지 확인한다.
 * 진단에 후보가 없으면(평가 범위 밖) 별도 기준을 만들지 않고 통과로 본다.
 */
export function isSensitivityGuardrailBroken(
  sensitivity: ParameterSensitivity | null,
  fingerprint: string,
  modelVersion: string,
): boolean {
  const candidate = sensitivity?.groups
    .flatMap((group) => group.candidates)
    .find((item) => buildCandidateFingerprint(item.params, modelVersion) === fingerprint);

  if (candidate === undefined || candidate.qualityChecks === null) {
    return false;
  }

  return !(
    candidate.qualityChecks.longStable &&
    candidate.qualityChecks.maxErrorStable &&
    candidate.qualityChecks.churnStable
  );
}

export type PendingTransitionDecision =
  | { action: "apply"; candidateParams: ForecastModelParams }
  | { action: "cancel"; reason: "baseline_changed_before_application" | "model_version_changed_before_application" }
  | { action: "skip" };

export interface PendingTransitionRecord {
  status: string;
  modelVersion: string;
  baselineFingerprint: string;
  candidateParams: ForecastModelParams;
}

/**
 * 다음 Forecast 실행에서 승인된 후보를 적용할지 판단한다.
 * 승인 이후 baseline이나 모델 버전이 바뀌었으면 적용하지 않고 취소한다.
 */
export function resolvePendingTransition(
  transition: PendingTransitionRecord | null,
  currentParams: ForecastModelParams,
  modelVersion: string,
): PendingTransitionDecision {
  if (transition === null || transition.status !== "approved_pending") {
    return { action: "skip" };
  }

  if (transition.modelVersion !== modelVersion) {
    return { action: "cancel", reason: "model_version_changed_before_application" };
  }

  if (transition.baselineFingerprint !== buildCandidateFingerprint(currentParams, modelVersion)) {
    return { action: "cancel", reason: "baseline_changed_before_application" };
  }

  return { action: "apply", candidateParams: transition.candidateParams };
}

export type RollbackBlockReason =
  | "monitoring_not_reviewable"
  | "sample_not_complete"
  | "current_params_mismatch"
  | "model_version_mismatch"
  | "rollback_guardrail_broken"
  | "cooldown_active"
  | "already_approved";

export interface RollbackEligibility {
  eligible: boolean;
  blockReason: RollbackBlockReason | null;
  cooldownRemainingDays: number;
  currentFingerprint: string;
  rollbackFingerprint: string;
  summary: PostTransitionSummary;
}

export interface EvaluateRollbackEligibilityInput {
  monitoring: PostTransitionMonitoring;
  currentParams: ForecastModelParams;
  currentPromotedAt: Date | null;
  modelVersion: string;
  sensitivity: ParameterSensitivity | null;
  hasPendingTransition: boolean;
  now: Date;
}

/**
 * 전환 후 모니터링 결과로 이전 설정 복원 가능 여부를 판단한다.
 * 승인 게이트와 같은 guardrail·cooldown을 사용하고 롤백 전용 임계값은 만들지 않는다.
 */
export function evaluateRollbackEligibility({
  monitoring,
  currentParams,
  currentPromotedAt,
  modelVersion,
  sensitivity,
  hasPendingTransition,
  now,
}: EvaluateRollbackEligibilityInput): RollbackEligibility {
  const summary = summarizePostTransitionMonitoring(monitoring);
  const currentFingerprint = buildCandidateFingerprint(currentParams, modelVersion);
  const rollbackFingerprint = buildCandidateFingerprint(monitoring.rollbackParams, modelVersion);
  const cooldown = evaluatePromotionCooldown(currentPromotedAt, now);
  const blockReason: RollbackBlockReason | null =
    monitoring.modelVersion !== modelVersion
      ? "model_version_mismatch"
      : buildCandidateFingerprint(monitoring.currentParams, modelVersion) !== currentFingerprint
        ? "current_params_mismatch"
        : summary.completedSampleCount < summary.requiredSampleCount
          ? "sample_not_complete"
          : summary.status !== "rollback_reviewable"
            ? "monitoring_not_reviewable"
            : isSensitivityGuardrailBroken(sensitivity, rollbackFingerprint, modelVersion)
              ? "rollback_guardrail_broken"
              : hasPendingTransition
                ? "already_approved"
                : !cooldown.elapsed
                  ? "cooldown_active"
                  : null;

  return {
    eligible: blockReason === null,
    blockReason,
    cooldownRemainingDays: cooldown.remainingDays,
    currentFingerprint,
    rollbackFingerprint,
    summary,
  };
}
