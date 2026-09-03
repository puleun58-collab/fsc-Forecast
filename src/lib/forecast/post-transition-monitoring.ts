import { z } from "zod";

import { ForecastModelParamsSchema, type ForecastModelParams } from "./forecast-model-config";
import {
  buildCandidateFingerprint,
  recordShadowCycle,
  summarizeShadowValidation,
  SHADOW_REQUIRED_SAMPLE_COUNT,
  type ShadowObservation,
  type ShadowQualityChecks,
  type ShadowValidationSession,
  type ShadowWindowMetrics,
} from "./shadow-validation";

export const POST_TRANSITION_MONITORING_VERSION = 1;
/** 전환 후 판정도 기존 승격 최소 표본(13주)을 그대로 사용한다. */
export const POST_TRANSITION_REQUIRED_SAMPLE_COUNT = SHADOW_REQUIRED_SAMPLE_COUNT;
/** metadata 누적을 막기 위해 완료 관측은 최근 26건만 유지한다. */
export const POST_TRANSITION_OBSERVATION_LIMIT = 26;

export type PostTransitionStatus =
  | "monitoring"
  | "stable"
  | "rollback_reviewable"
  | "rolled_back"
  | "stopped";

export type PostTransitionStopReason = "model_version_changed" | "current_params_changed";

/**
 * Shadow 검증과 완전히 같은 pairwise 관측 구조를 재사용한다.
 * baseline* = 현재 운영 설정, shadow* = 롤백 기준(전환 직전) 설정.
 */
export interface PostTransitionMonitoring {
  version: number;
  sourceTransitionId: string;
  modelVersion: string;
  currentParams: ForecastModelParams;
  rollbackParams: ForecastModelParams;
  startedAt: string;
  status: PostTransitionStatus;
  stoppedReason: PostTransitionStopReason | null;
  requiredSampleCount: number;
  observations: ShadowObservation[];
}

export interface PostTransitionSummary {
  status: PostTransitionStatus;
  completedSampleCount: number;
  pendingSampleCount: number;
  requiredSampleCount: number;
  current: ShadowWindowMetrics;
  rollback: ShadowWindowMetrics;
  qualityChecks: ShadowQualityChecks;
}

const ModelParamsSchema = ForecastModelParamsSchema;

const DirectionSchema = z.enum(["up", "down", "flat"]);

const ObservationSchema = z.object({
  originWeekEndDate: z.string(),
  targetDate: z.string(),
  issuedAt: z.string(),
  anchorKrwPerL: z.number(),
  baselineForecastKrwPerL: z.number(),
  shadowForecastKrwPerL: z.number(),
  actualKrwPerL: z.number().nullable(),
  baselineAbsoluteErrorKrwPerL: z.number().nullable(),
  shadowAbsoluteErrorKrwPerL: z.number().nullable(),
  baselineApePct: z.number().nullable(),
  shadowApePct: z.number().nullable(),
  baselineDirection: DirectionSchema,
  shadowDirection: DirectionSchema,
  actualDirection: DirectionSchema.nullable(),
});

const MonitoringSchema = z.object({
  version: z.number(),
  sourceTransitionId: z.string(),
  modelVersion: z.string(),
  currentParams: ModelParamsSchema,
  rollbackParams: ModelParamsSchema,
  startedAt: z.string(),
  status: z.enum(["monitoring", "stable", "rollback_reviewable", "rolled_back", "stopped"]),
  stoppedReason: z.enum(["model_version_changed", "current_params_changed"]).nullable(),
  requiredSampleCount: z.number(),
  observations: z.array(ObservationSchema),
});

const MonitoringMetadataSchema = z.object({
  model: z.object({ postTransitionMonitoring: MonitoringSchema }),
});

export function readPostTransitionMonitoring(metadata: unknown): PostTransitionMonitoring | null {
  const parsed = MonitoringMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.postTransitionMonitoring : null;
}

function isActive(monitoring: PostTransitionMonitoring): boolean {
  return (
    monitoring.status === "monitoring" ||
    monitoring.status === "stable" ||
    monitoring.status === "rollback_reviewable"
  );
}

function toSession(
  monitoring: PostTransitionMonitoring,
  observations: readonly ShadowObservation[],
): ShadowValidationSession {
  return {
    version: monitoring.version,
    sessionId: monitoring.sourceTransitionId,
    status: "validating",
    stoppedReason: null,
    startedAt: monitoring.startedAt,
    completedAt: null,
    baselineModelVersion: monitoring.modelVersion,
    baselineParams: monitoring.currentParams,
    candidateParams: monitoring.rollbackParams,
    candidateFingerprint: buildCandidateFingerprint(monitoring.rollbackParams, monitoring.modelVersion),
    candidateSource: "post-transition-rollback",
    requiredSampleCount: monitoring.requiredSampleCount,
    observations: [...observations],
  };
}

/** 판정은 항상 가장 최근 13개 완료 관측만 사용한다. */
function selectJudgementObservations(
  monitoring: PostTransitionMonitoring,
): readonly ShadowObservation[] {
  const completed = monitoring.observations
    .filter((observation) => observation.actualKrwPerL !== null)
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate))
    .slice(-monitoring.requiredSampleCount);
  const pending = monitoring.observations.filter((observation) => observation.actualKrwPerL === null);

  return [...completed, ...pending];
}

export function summarizePostTransitionMonitoring(
  monitoring: PostTransitionMonitoring,
): PostTransitionSummary {
  const judgement = selectJudgementObservations(monitoring);
  const summary = summarizeShadowValidation(toSession(monitoring, judgement));
  const status: PostTransitionStatus = !isActive(monitoring)
    ? monitoring.status
    : summary.status === "validating"
      ? "monitoring"
      : summary.status === "reviewable"
        ? "rollback_reviewable"
        : "stable";

  return {
    status,
    completedSampleCount: summary.completedSampleCount,
    pendingSampleCount: summary.pendingSampleCount,
    requiredSampleCount: summary.requiredSampleCount,
    current: summary.baseline,
    rollback: summary.shadow,
    qualityChecks: summary.qualityChecks,
  };
}

export interface AppliedTransitionInput {
  transitionId: string;
  currentParams: ForecastModelParams;
  rollbackParams: ForecastModelParams;
  sourceKind: string;
}

export interface ResolvePostTransitionMonitoringInput {
  previous: PostTransitionMonitoring | null;
  appliedTransition: AppliedTransitionInput | null;
  currentParams: ForecastModelParams;
  modelVersion: string;
  now: Date;
}

/**
 * 전환이 실제 적용된 run에서 모니터링을 시작하고, 이후 run에서는 이어간다.
 * 모델 버전이나 운영 파라미터가 다른 이유로 바뀌면 관측을 섞지 않고 중단한다.
 */
export function resolvePostTransitionMonitoring({
  previous,
  appliedTransition,
  currentParams,
  modelVersion,
  now,
}: ResolvePostTransitionMonitoringInput): PostTransitionMonitoring | null {
  if (appliedTransition !== null) {
    if (appliedTransition.sourceKind === "post_transition_rollback") {
      return previous === null
        ? null
        : { ...previous, status: "rolled_back", stoppedReason: null };
    }

    return {
      version: POST_TRANSITION_MONITORING_VERSION,
      sourceTransitionId: appliedTransition.transitionId,
      modelVersion,
      currentParams: appliedTransition.currentParams,
      rollbackParams: appliedTransition.rollbackParams,
      startedAt: now.toISOString(),
      status: "monitoring",
      stoppedReason: null,
      requiredSampleCount: POST_TRANSITION_REQUIRED_SAMPLE_COUNT,
      observations: [],
    };
  }

  if (previous === null || !isActive(previous)) {
    return previous;
  }

  if (previous.modelVersion !== modelVersion) {
    return { ...previous, status: "stopped", stoppedReason: "model_version_changed" };
  }

  if (
    buildCandidateFingerprint(previous.currentParams, modelVersion) !==
    buildCandidateFingerprint(currentParams, modelVersion)
  ) {
    return { ...previous, status: "stopped", stoppedReason: "current_params_changed" };
  }

  return previous;
}

export interface RecordPostTransitionCycleInput {
  monitoring: PostTransitionMonitoring;
  /** 확정된 주간 실제값만 전달한다. */
  confirmedWeeks: readonly { targetDate: Date; actualKrwPerL: number }[];
  prediction: {
    originWeekEndDate: Date;
    targetDate: Date;
    anchorKrwPerL: number;
    currentForecastKrwPerL: number;
    rollbackForecastKrwPerL: number;
    issuedAt: Date;
  } | null;
  now: Date;
}

/**
 * Shadow와 동일한 관측 기록 로직을 재사용한다.
 * 이미 발행된 주차 예측은 덮어쓰지 않고, 완료 관측은 최근 26건만 남긴다.
 */
export function recordPostTransitionCycle({
  monitoring,
  confirmedWeeks,
  prediction,
  now,
}: RecordPostTransitionCycleInput): PostTransitionMonitoring {
  if (!isActive(monitoring)) {
    return monitoring;
  }

  const recorded = recordShadowCycle({
    session: toSession(monitoring, monitoring.observations),
    confirmedWeeks,
    now,
    prediction:
      prediction === null
        ? null
        : {
            originWeekEndDate: prediction.originWeekEndDate,
            targetDate: prediction.targetDate,
            anchorKrwPerL: prediction.anchorKrwPerL,
            baselineForecastKrwPerL: prediction.currentForecastKrwPerL,
            shadowForecastKrwPerL: prediction.rollbackForecastKrwPerL,
            issuedAt: prediction.issuedAt,
          },
  });
  const completed = recorded.observations
    .filter((observation) => observation.actualKrwPerL !== null)
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate))
    .slice(-POST_TRANSITION_OBSERVATION_LIMIT);
  const pending = recorded.observations.filter((observation) => observation.actualKrwPerL === null);
  const next: PostTransitionMonitoring = {
    ...monitoring,
    observations: [...completed, ...pending],
  };

  return { ...next, status: summarizePostTransitionMonitoring(next).status };
}
