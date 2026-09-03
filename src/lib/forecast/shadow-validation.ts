import { z } from "zod";

import {
  ForecastModelParamsSchema,
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_MIN_SAMPLE_COUNT,
  PROMOTION_VOLATILITY_TOLERANCE_RATIO,
  type ForecastModelParams,
} from "./forecast-model-config";
import { resolveForecastDirection, type ForecastDirection } from "./run-walk-forward-backtest";

export const SHADOW_VALIDATION_VERSION = 1;
/** 과거 백테스트와 동일한 최소 표본 기준을 재사용한다. */
export const SHADOW_REQUIRED_SAMPLE_COUNT = PROMOTION_MIN_SAMPLE_COUNT;

export type ShadowSessionStatus = "validating" | "reviewable" | "failed" | "stopped";

export type ShadowStopReason = "baseline_params_changed" | "model_version_changed";

export interface ShadowObservation {
  originWeekEndDate: string;
  targetDate: string;
  issuedAt: string;
  anchorKrwPerL: number;
  baselineForecastKrwPerL: number;
  shadowForecastKrwPerL: number;
  actualKrwPerL: number | null;
  baselineAbsoluteErrorKrwPerL: number | null;
  shadowAbsoluteErrorKrwPerL: number | null;
  baselineApePct: number | null;
  shadowApePct: number | null;
  baselineDirection: ForecastDirection;
  shadowDirection: ForecastDirection;
  actualDirection: ForecastDirection | null;
}

export interface ShadowValidationSession {
  version: number;
  sessionId: string;
  status: ShadowSessionStatus;
  stoppedReason: ShadowStopReason | null;
  startedAt: string;
  completedAt: string | null;
  baselineModelVersion: string;
  baselineParams: ForecastModelParams;
  candidateParams: ForecastModelParams;
  candidateFingerprint: string;
  candidateSource: string;
  requiredSampleCount: number;
  observations: ShadowObservation[];
}

export interface ShadowWindowMetrics {
  maeKrwPerL: number | null;
  mapePct: number | null;
  directionAccuracyRatio: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  forecastChurnKrwPerL: number | null;
}

export interface ShadowQualityChecks {
  maeImprovementRatio: number | null;
  mapeImprovementPctPoint: number | null;
  meetsMinimumImprovement: boolean;
  maxErrorStable: boolean;
  churnStable: boolean;
}

export interface ShadowValidationSummary {
  status: ShadowSessionStatus;
  completedSampleCount: number;
  pendingSampleCount: number;
  requiredSampleCount: number;
  baseline: ShadowWindowMetrics;
  shadow: ShadowWindowMetrics;
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

const SessionSchema = z.object({
  version: z.number(),
  sessionId: z.string(),
  status: z.enum(["validating", "reviewable", "failed", "stopped"]),
  stoppedReason: z.enum(["baseline_params_changed", "model_version_changed"]).nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  baselineModelVersion: z.string(),
  baselineParams: ModelParamsSchema,
  candidateParams: ModelParamsSchema,
  candidateFingerprint: z.string(),
  candidateSource: z.string(),
  requiredSampleCount: z.number(),
  observations: z.array(ObservationSchema),
});

const ShadowMetadataSchema = z.object({
  model: z.object({ shadowValidation: SessionSchema }),
});

export function buildCandidateFingerprint(params: ForecastModelParams, modelVersion: string): string {
  const dubai = params.dubai === null ? "none" : `${params.dubai.lagWeeks}:${params.dubai.weight}`;
  const usdKrw = params.usdKrw === null ? "none" : `${params.usdKrw.lagWeeks}:${params.usdKrw.weight}`;

  return [
    modelVersion,
    params.modelId,
    params.trendLookbackWeeks,
    dubai,
    usdKrw,
    params.externalAdjustmentCapRatio,
    params.biasCorrection === null
      ? "none"
      : `${params.biasCorrection.lookbackWeeks}:${params.biasCorrection.weight}`,
    params.dailySignal === null
      ? "none"
      : `${params.dailySignal.lookbackObservations}:${params.dailySignal.weight}`,
  ].join("|");
}

function sameParams(left: ForecastModelParams, right: ForecastModelParams, modelVersion: string): boolean {
  return buildCandidateFingerprint(left, modelVersion) === buildCandidateFingerprint(right, modelVersion);
}

/** Shadow는 민감도 UI 타입이 아니라 후보 params·품질 통과 여부·출처만 알면 된다. */
export interface ShadowCandidateInput {
  params: ForecastModelParams;
  meetsPromotionQuality: boolean;
  source: string;
}

export interface ResolveShadowSessionInput {
  previousSession: ShadowValidationSession | null;
  modelVersion: string;
  baselineParams: ForecastModelParams;
  candidates: readonly ShadowCandidateInput[];
  now: Date;
}

/**
 * 진행 중인 Shadow session을 이어받거나, 없으면 민감도 분석 1순위 후보로 새 session을 연다.
 * 검증 중에는 후보 파라미터를 교체하지 않는다.
 */
export function resolveShadowSession({
  previousSession,
  modelVersion,
  baselineParams,
  candidates,
  now,
}: ResolveShadowSessionInput): ShadowValidationSession | null {
  if (previousSession !== null && previousSession.status === "validating") {
    if (previousSession.baselineModelVersion !== modelVersion) {
      return {
        ...previousSession,
        status: "stopped",
        stoppedReason: "model_version_changed",
        completedAt: now.toISOString(),
      };
    }

    if (!sameParams(previousSession.baselineParams, baselineParams, modelVersion)) {
      return {
        ...previousSession,
        status: "stopped",
        stoppedReason: "baseline_params_changed",
        completedAt: now.toISOString(),
      };
    }

    return previousSession;
  }

  const previousFingerprint = previousSession?.candidateFingerprint ?? null;
  const candidate = candidates.find(
    (item) =>
      item.meetsPromotionQuality &&
      !sameParams(item.params, baselineParams, modelVersion) &&
      buildCandidateFingerprint(item.params, modelVersion) !== previousFingerprint,
  );

  if (candidate === undefined) {
    return previousSession;
  }

  return {
    version: SHADOW_VALIDATION_VERSION,
    sessionId: `${buildCandidateFingerprint(candidate.params, modelVersion)}@${now.toISOString()}`,
    status: "validating",
    stoppedReason: null,
    startedAt: now.toISOString(),
    completedAt: null,
    baselineModelVersion: modelVersion,
    baselineParams,
    candidateParams: candidate.params,
    candidateFingerprint: buildCandidateFingerprint(candidate.params, modelVersion),
    candidateSource: candidate.source,
    requiredSampleCount: SHADOW_REQUIRED_SAMPLE_COUNT,
    observations: [],
  };
}

export interface ShadowPredictionInput {
  originWeekEndDate: Date;
  targetDate: Date;
  anchorKrwPerL: number;
  baselineForecastKrwPerL: number;
  shadowForecastKrwPerL: number;
  issuedAt: Date;
}

export interface RecordShadowCycleInput {
  session: ShadowValidationSession;
  /** 확정된 주간 실제값만 전달한다. 진행 중 주차는 포함하지 않는다. */
  confirmedWeeks: readonly { targetDate: Date; actualKrwPerL: number }[];
  prediction: ShadowPredictionInput | null;
  now: Date;
}

/**
 * 확정 Actual로 기존 관측을 채우고, 아직 없는 target 주차에 대해서만 새 예측을 발행한다.
 * 이미 발행된 예측값은 절대 덮어쓰지 않는다.
 */
export function recordShadowCycle({
  session,
  confirmedWeeks,
  prediction,
  now,
}: RecordShadowCycleInput): ShadowValidationSession {
  if (session.status !== "validating") {
    return session;
  }

  const actualByTargetDate = new Map(
    confirmedWeeks.map((week) => [week.targetDate.toISOString(), week.actualKrwPerL]),
  );
  const observations = session.observations.map((observation) => {
    if (observation.actualKrwPerL !== null) {
      return observation;
    }

    const actualKrwPerL = actualByTargetDate.get(observation.targetDate);

    if (actualKrwPerL === undefined) {
      return observation;
    }

    const baselineAbsoluteErrorKrwPerL = Math.abs(observation.baselineForecastKrwPerL - actualKrwPerL);
    const shadowAbsoluteErrorKrwPerL = Math.abs(observation.shadowForecastKrwPerL - actualKrwPerL);

    return {
      ...observation,
      actualKrwPerL,
      baselineAbsoluteErrorKrwPerL,
      shadowAbsoluteErrorKrwPerL,
      baselineApePct:
        actualKrwPerL === 0 ? null : (baselineAbsoluteErrorKrwPerL / actualKrwPerL) * 100,
      shadowApePct: actualKrwPerL === 0 ? null : (shadowAbsoluteErrorKrwPerL / actualKrwPerL) * 100,
      actualDirection: resolveForecastDirection(observation.anchorKrwPerL, actualKrwPerL),
    };
  });
  const knownTargetDates = new Set(observations.map((observation) => observation.targetDate));
  const targetDate = prediction?.targetDate.toISOString() ?? null;
  const alreadyConfirmed = targetDate !== null && actualByTargetDate.has(targetDate);

  if (prediction !== null && targetDate !== null && !knownTargetDates.has(targetDate) && !alreadyConfirmed) {
    observations.push({
      originWeekEndDate: prediction.originWeekEndDate.toISOString(),
      targetDate,
      issuedAt: prediction.issuedAt.toISOString(),
      anchorKrwPerL: prediction.anchorKrwPerL,
      baselineForecastKrwPerL: prediction.baselineForecastKrwPerL,
      shadowForecastKrwPerL: prediction.shadowForecastKrwPerL,
      actualKrwPerL: null,
      baselineAbsoluteErrorKrwPerL: null,
      shadowAbsoluteErrorKrwPerL: null,
      baselineApePct: null,
      shadowApePct: null,
      baselineDirection: resolveForecastDirection(
        prediction.anchorKrwPerL,
        prediction.baselineForecastKrwPerL,
      ),
      shadowDirection: resolveForecastDirection(
        prediction.anchorKrwPerL,
        prediction.shadowForecastKrwPerL,
      ),
      actualDirection: null,
    });
  }

  const summary = summarizeShadowValidation({ ...session, observations });

  return {
    ...session,
    observations,
    status: summary.status,
    completedAt:
      summary.status === "reviewable" || summary.status === "failed" ? now.toISOString() : null,
  };
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildWindowMetrics(
  errors: readonly number[],
  percentageErrors: readonly number[],
  directionHits: readonly boolean[],
  forecasts: readonly number[],
): ShadowWindowMetrics {
  const churnSamples = forecasts
    .slice(1)
    .map((value, index) => Math.abs(value - (forecasts[index] ?? value)));

  return {
    maeKrwPerL: average(errors),
    mapePct: average(percentageErrors),
    directionAccuracyRatio:
      directionHits.length === 0
        ? null
        : directionHits.filter((hit) => hit).length / directionHits.length,
    maxAbsoluteErrorKrwPerL: errors.length === 0 ? null : Math.max(...errors),
    forecastChurnKrwPerL: average(churnSamples),
  };
}

export function summarizeShadowValidation(session: ShadowValidationSession): ShadowValidationSummary {
  const completed = session.observations
    .filter((observation) => observation.actualKrwPerL !== null)
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate));
  const baseline = buildWindowMetrics(
    completed.flatMap((item) =>
      item.baselineAbsoluteErrorKrwPerL === null ? [] : [item.baselineAbsoluteErrorKrwPerL],
    ),
    completed.flatMap((item) => (item.baselineApePct === null ? [] : [item.baselineApePct])),
    completed.map((item) => item.baselineDirection === item.actualDirection),
    completed.map((item) => item.baselineForecastKrwPerL),
  );
  const shadow = buildWindowMetrics(
    completed.flatMap((item) =>
      item.shadowAbsoluteErrorKrwPerL === null ? [] : [item.shadowAbsoluteErrorKrwPerL],
    ),
    completed.flatMap((item) => (item.shadowApePct === null ? [] : [item.shadowApePct])),
    completed.map((item) => item.shadowDirection === item.actualDirection),
    completed.map((item) => item.shadowForecastKrwPerL),
  );
  const maeImprovementRatio =
    baseline.maeKrwPerL === null || baseline.maeKrwPerL === 0 || shadow.maeKrwPerL === null
      ? null
      : (baseline.maeKrwPerL - shadow.maeKrwPerL) / baseline.maeKrwPerL;
  const mapeImprovementPctPoint =
    baseline.mapePct === null || shadow.mapePct === null ? null : baseline.mapePct - shadow.mapePct;
  const qualityChecks: ShadowQualityChecks = {
    maeImprovementRatio,
    mapeImprovementPctPoint,
    meetsMinimumImprovement:
      (maeImprovementRatio !== null && maeImprovementRatio >= PROMOTION_MIN_MAE_IMPROVEMENT_RATIO) ||
      (mapeImprovementPctPoint !== null &&
        mapeImprovementPctPoint >= PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT),
    maxErrorStable:
      baseline.maxAbsoluteErrorKrwPerL === null ||
      shadow.maxAbsoluteErrorKrwPerL === null ||
      shadow.maxAbsoluteErrorKrwPerL <=
        baseline.maxAbsoluteErrorKrwPerL * PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
    churnStable:
      baseline.forecastChurnKrwPerL === null ||
      shadow.forecastChurnKrwPerL === null ||
      shadow.forecastChurnKrwPerL <=
        baseline.forecastChurnKrwPerL * PROMOTION_VOLATILITY_TOLERANCE_RATIO,
  };
  const meetsAllChecks =
    qualityChecks.meetsMinimumImprovement && qualityChecks.maxErrorStable && qualityChecks.churnStable;
  const status: ShadowSessionStatus =
    session.status === "stopped"
      ? "stopped"
      : completed.length < session.requiredSampleCount
        ? "validating"
        : meetsAllChecks
          ? "reviewable"
          : "failed";

  return {
    status,
    completedSampleCount: completed.length,
    pendingSampleCount: session.observations.length - completed.length,
    requiredSampleCount: session.requiredSampleCount,
    baseline,
    shadow,
    qualityChecks,
  };
}

export function readShadowValidation(metadata: unknown): ShadowValidationSession | null {
  const parsed = ShadowMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.shadowValidation : null;
}
