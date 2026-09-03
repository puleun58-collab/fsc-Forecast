import { z } from "zod";

import { PROMOTION_MIN_SAMPLE_COUNT, type ForecastModelParams } from "./forecast-model-config";
import { buildCandidateFingerprint } from "./shadow-validation";
import {
  isSignalActive,
  SIGNAL_ORDER,
  type ForecastSignalKey,
} from "./signal-contribution";

export const SIGNAL_FORWARD_VALIDATION_VERSION = 1;
/** Shadow와 같은 기준으로 새 실제 데이터 13주를 모은다. */
export const SIGNAL_FORWARD_REQUIRED_SAMPLE_COUNT = PROMOTION_MIN_SAMPLE_COUNT;

export type SignalForwardStatus =
  | "validating"
  | "improved"
  | "worsened"
  | "mixed"
  | "insufficient-sample";

export interface SignalForwardObservation {
  originWeekEndDate: string;
  targetDate: string;
  issuedAt: string;
  baselineForecastKrwPerL: number;
  ablatedForecastKrwPerL: number;
  actualKrwPerL: number | null;
}

export interface SignalForwardSession {
  signal: ForecastSignalKey;
  /** 비교 기준이 된 운영 파라미터. 바뀌면 새 세션을 연다. */
  baselineFingerprint: string;
  startedAt: string;
  observations: SignalForwardObservation[];
}

export interface SignalForwardValidation {
  version: number;
  sessions: SignalForwardSession[];
}

export interface SignalForwardMetrics {
  completedSampleCount: number;
  requiredSampleCount: number;
  baselineMaeKrwPerL: number | null;
  ablatedMaeKrwPerL: number | null;
  maeContributionKrwPerL: number | null;
  baselineMapePct: number | null;
  ablatedMapePct: number | null;
  mapeContributionPctPoint: number | null;
  maxBaselineAbsoluteErrorKrwPerL: number | null;
}

export interface SignalForwardSummary extends SignalForwardMetrics {
  signal: ForecastSignalKey;
  status: SignalForwardStatus;
  baselineFingerprint: string;
  startedAt: string;
}

function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 새 target 주차의 진단 예측. 발행 시점 입력만 담는다. */
export interface SignalForwardPrediction {
  signal: ForecastSignalKey;
  originWeekEndDate: Date;
  targetDate: Date;
  issuedAt: Date;
  baselineForecastKrwPerL: number;
  ablatedForecastKrwPerL: number;
}

export interface RecordSignalForwardCycleInput {
  previous: SignalForwardValidation | null;
  baselineParams: ForecastModelParams;
  modelVersion: string;
  /** 이번 실행에서 실제로 사용된 신호만 전달한다. */
  predictions: readonly SignalForwardPrediction[];
  /** 확정된 주간 실제값. 진행 중 주차는 넘기지 않는다. */
  confirmedWeeks: readonly { targetDate: Date; actualKrwPerL: number }[];
  now: Date;
}

/**
 * 확정 Actual로 기존 관측을 채우고, 아직 없는 target에만 진단 예측을 새로 발행한다.
 * 이미 발행된 값은 어떤 경우에도 덮어쓰지 않는다.
 */
export function recordSignalForwardCycle({
  previous,
  baselineParams,
  modelVersion,
  predictions,
  confirmedWeeks,
  now,
}: RecordSignalForwardCycleInput): SignalForwardValidation {
  const baselineFingerprint = buildCandidateFingerprint(baselineParams, modelVersion);
  const actualByTargetDate = new Map(
    confirmedWeeks.map((week) => [week.targetDate.toISOString(), week.actualKrwPerL]),
  );
  const predictionBySignal = new Map(
    predictions.map((prediction) => [prediction.signal, prediction]),
  );
  const previousSessions = new Map(
    (previous?.sessions ?? []).map((session) => [session.signal, session]),
  );
  const sessions = SIGNAL_ORDER.flatMap((signal): SignalForwardSession[] => {
    const prediction = predictionBySignal.get(signal) ?? null;
    const stored = previousSessions.get(signal) ?? null;
    // 비교 기준이 달라졌으면 기존 표본과 섞지 않고 새 세션을 시작한다.
    const reusable = stored !== null && stored.baselineFingerprint === baselineFingerprint;
    const session: SignalForwardSession | null = reusable
      ? stored
      : prediction === null
        ? stored
        : {
            signal,
            baselineFingerprint,
            startedAt: now.toISOString(),
            observations: [],
          };

    if (session === null) {
      return [];
    }

    const observations = session.observations.map((observation) => {
      if (observation.actualKrwPerL !== null) {
        return observation;
      }

      const actualKrwPerL = actualByTargetDate.get(observation.targetDate);

      return actualKrwPerL === undefined ? observation : { ...observation, actualKrwPerL };
    });
    const knownTargets = new Set(observations.map((observation) => observation.targetDate));
    const targetDate = prediction?.targetDate.toISOString() ?? null;

    if (
      prediction !== null &&
      targetDate !== null &&
      !knownTargets.has(targetDate) &&
      !actualByTargetDate.has(targetDate)
    ) {
      observations.push({
        originWeekEndDate: prediction.originWeekEndDate.toISOString(),
        targetDate,
        issuedAt: prediction.issuedAt.toISOString(),
        baselineForecastKrwPerL: prediction.baselineForecastKrwPerL,
        ablatedForecastKrwPerL: prediction.ablatedForecastKrwPerL,
        actualKrwPerL: null,
      });
    }

    return [{ ...session, observations }];
  });

  return { version: SIGNAL_FORWARD_VALIDATION_VERSION, sessions };
}

export function summarizeSignalForwardSession(
  session: SignalForwardSession,
  requiredSampleCount = SIGNAL_FORWARD_REQUIRED_SAMPLE_COUNT,
): SignalForwardSummary {
  const completed = session.observations.flatMap((observation) =>
    observation.actualKrwPerL === null
      ? []
      : [{ ...observation, actualKrwPerL: observation.actualKrwPerL }],
  );
  const baselineErrors = completed.map((observation) =>
    Math.abs(observation.baselineForecastKrwPerL - observation.actualKrwPerL),
  );
  const ablatedErrors = completed.map((observation) =>
    Math.abs(observation.ablatedForecastKrwPerL - observation.actualKrwPerL),
  );
  const baselineApes = completed.flatMap((observation, index) =>
    observation.actualKrwPerL === 0
      ? []
      : [(baselineErrors[index] / observation.actualKrwPerL) * 100],
  );
  const ablatedApes = completed.flatMap((observation, index) =>
    observation.actualKrwPerL === 0
      ? []
      : [(ablatedErrors[index] / observation.actualKrwPerL) * 100],
  );
  const baselineMae = round(average(baselineErrors));
  const ablatedMae = round(average(ablatedErrors));
  const baselineMape = round(average(baselineApes));
  const ablatedMape = round(average(ablatedApes));
  const maeContribution =
    baselineMae === null || ablatedMae === null ? null : round(ablatedMae - baselineMae);
  const mapeContribution =
    baselineMape === null || ablatedMape === null ? null : round(ablatedMape - baselineMape);

  return {
    signal: session.signal,
    status: resolveForwardStatus(completed.length, requiredSampleCount, maeContribution, mapeContribution),
    baselineFingerprint: session.baselineFingerprint,
    startedAt: session.startedAt,
    completedSampleCount: completed.length,
    requiredSampleCount,
    baselineMaeKrwPerL: baselineMae,
    ablatedMaeKrwPerL: ablatedMae,
    maeContributionKrwPerL: maeContribution,
    baselineMapePct: baselineMape,
    ablatedMapePct: ablatedMape,
    mapeContributionPctPoint: mapeContribution,
    maxBaselineAbsoluteErrorKrwPerL:
      baselineErrors.length === 0 ? null : round(Math.max(...baselineErrors)),
  };
}

/** 13주가 차기 전에는 어떤 방향으로도 결론 내지 않는다. */
function resolveForwardStatus(
  completedSampleCount: number,
  requiredSampleCount: number,
  maeContribution: number | null,
  mapeContribution: number | null,
): SignalForwardStatus {
  if (completedSampleCount < requiredSampleCount) {
    return completedSampleCount === 0 ? "insufficient-sample" : "validating";
  }

  if (maeContribution === null) {
    return "insufficient-sample";
  }

  const directions = [maeContribution, mapeContribution]
    .flatMap((value) => (value === null ? [] : [Math.sign(value)]))
    .filter((direction) => direction !== 0);

  if (directions.length === 0) {
    return "mixed";
  }

  if (directions.every((direction) => direction > 0)) {
    return "improved";
  }

  return directions.every((direction) => direction < 0) ? "worsened" : "mixed";
}

export function summarizeSignalForwardValidation(
  validation: SignalForwardValidation | null,
  requiredSampleCount = SIGNAL_FORWARD_REQUIRED_SAMPLE_COUNT,
): SignalForwardSummary[] {
  return (validation?.sessions ?? []).map((session) =>
    summarizeSignalForwardSession(session, requiredSampleCount),
  );
}

/** 이번 실행에서 진단 예측을 만들 신호. 실제로 사용 중인 신호만 대상이다. */
export function selectForwardSignals(params: ForecastModelParams): ForecastSignalKey[] {
  return SIGNAL_ORDER.filter((signal) => signal !== "trend" && isSignalActive(params, signal));
}

const ObservationSchema = z.object({
  originWeekEndDate: z.string(),
  targetDate: z.string(),
  issuedAt: z.string(),
  baselineForecastKrwPerL: z.number(),
  ablatedForecastKrwPerL: z.number(),
  actualKrwPerL: z.number().nullable(),
});

const ForwardMetadataSchema = z.object({
  model: z.object({
    signalForwardValidation: z.object({
      version: z.number(),
      sessions: z.array(
        z.object({
          signal: z.enum(["trend", "dubai", "usdKrw", "bias", "dailySignal"]),
          baselineFingerprint: z.string(),
          startedAt: z.string(),
          observations: z.array(ObservationSchema),
        }),
      ),
    }),
  }),
});

/** 이 기능 적용 이전 run에는 블록이 없으므로 null이어야 한다. */
export function readSignalForwardValidation(metadata: unknown): SignalForwardValidation | null {
  const parsed = ForwardMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.signalForwardValidation : null;
}
