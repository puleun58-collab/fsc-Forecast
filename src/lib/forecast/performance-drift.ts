import { z } from "zod";

import {
  LONG_EVALUATION_WEEKS,
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  RECENT_EVALUATION_WEEKS,
} from "./forecast-model-config";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

export const PERFORMANCE_DRIFT_VERSION = 1;
/** 조기 경보용 단기 구간. 표본이 적어 자동 조치 근거로 쓰지 않는다. */
export const DRIFT_SHORT_WINDOW_WEEKS = 4;
/** 이 비율 이상 나빠지면 관찰 대상으로 본다. 기존 최대오차 허용치를 재사용한다. */
export const DRIFT_WATCH_MAE_RATIO = PROMOTION_MAX_ERROR_TOLERANCE_RATIO;
/** 악화로 올리기 전에 필요한 연속 악화 주차 수. */
export const DRIFT_ALERT_MIN_WEEKS = 2;

export type PerformanceDriftStatus = "stable" | "watch" | "alert" | "undecided";

export type PerformanceDriftReason =
  | "recent-mae-up"
  | "recent-mape-up"
  | "repeated-degradation"
  | "single-large-error"
  | "direction-accuracy-down"
  | "insufficient-sample";

export interface DriftWindowMetrics {
  windowWeeks: number;
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  directionAccuracyRatio: number | null;
}

export interface PerformanceDrift {
  version: number;
  evaluatedAt: string;
  status: PerformanceDriftStatus;
  /** 새 실제 주차 기준 연속 악화 횟수. 같은 주 재실행으로 늘지 않는다. */
  degradedWeekCount: number;
  lastEvaluatedWeekEndDate: string | null;
  short: DriftWindowMetrics;
  medium: DriftWindowMetrics;
  long: DriftWindowMetrics;
  reasons: PerformanceDriftReason[];
}

/** 표시 정밀도(0.01) 반올림. 여러 창에서 같은 규칙을 써야 해 helper로 둔다. */
function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeWindow(
  points: readonly WalkForwardEvaluationPoint[],
  windowWeeks: number,
): DriftWindowMetrics {
  const window = points.slice(-windowWeeks);
  const errors = window.map((point) => point.absoluteErrorKrwPerL);
  const apes = window.flatMap((point) =>
    point.absolutePercentageErrorPct === null ? [] : [point.absolutePercentageErrorPct],
  );
  const hits = window.filter((point) => point.forecastDirection === point.actualDirection).length;

  return {
    windowWeeks,
    sampleCount: window.length,
    maeKrwPerL: round(average(errors)),
    mapePct: round(average(apes)),
    maxAbsoluteErrorKrwPerL: errors.length === 0 ? null : round(Math.max(...errors)),
    directionAccuracyRatio:
      window.length === 0 ? null : Math.round((hits / window.length) * 1000) / 1000,
  };
}

export interface BuildPerformanceDriftInput {
  /** 확정된 실제값이 있는 one-step 평가 지점만 들어온다. */
  oneStepPoints: readonly WalkForwardEvaluationPoint[];
  previous: PerformanceDrift | null;
  evaluatedAt: Date;
  shortWindowWeeks?: number;
  mediumWindowWeeks?: number;
  longWindowWeeks?: number;
}

/**
 * 최근 단기 성능이 중기 성능보다 나빠지고 있는지 알려주는 조기 경보다.
 * 모델·후보·Shadow·운영 파라미터를 바꾸지 않는다.
 */
export function buildPerformanceDrift({
  oneStepPoints,
  previous,
  evaluatedAt,
  shortWindowWeeks = DRIFT_SHORT_WINDOW_WEEKS,
  mediumWindowWeeks = RECENT_EVALUATION_WEEKS,
  longWindowWeeks = LONG_EVALUATION_WEEKS,
}: BuildPerformanceDriftInput): PerformanceDrift {
  const points = [...oneStepPoints]
    .filter((point) => point.horizonIndex === 1)
    .sort((left, right) => left.targetDate.getTime() - right.targetDate.getTime());
  const short = summarizeWindow(points, shortWindowWeeks);
  const medium = summarizeWindow(points, mediumWindowWeeks);
  const long = summarizeWindow(points, longWindowWeeks);
  const latestWeekEndDate = points.at(-1)?.targetDate.toISOString() ?? null;
  // 같은 주차에서 다시 실행되면 이전 판정을 그대로 유지한다.
  const isNewWeek =
    latestWeekEndDate !== null && latestWeekEndDate !== (previous?.lastEvaluatedWeekEndDate ?? null);

  if (
    short.sampleCount < shortWindowWeeks ||
    medium.sampleCount < mediumWindowWeeks ||
    short.maeKrwPerL === null ||
    medium.maeKrwPerL === null
  ) {
    return {
      version: PERFORMANCE_DRIFT_VERSION,
      evaluatedAt: evaluatedAt.toISOString(),
      status: "undecided",
      degradedWeekCount: 0,
      lastEvaluatedWeekEndDate: latestWeekEndDate,
      short,
      medium,
      long,
      reasons: ["insufficient-sample"],
    };
  }

  const maeRatio = medium.maeKrwPerL === 0 ? 1 : short.maeKrwPerL / medium.maeKrwPerL;
  const mapeUp =
    short.mapePct !== null && medium.mapePct !== null && short.mapePct > medium.mapePct;
  const degradedNow = maeRatio >= DRIFT_WATCH_MAE_RATIO;
  const degradedWeekCount = degradedNow
    ? (previous?.degradedWeekCount ?? 0) + (isNewWeek || previous === null ? 1 : 0)
    : 0;
  const carriedCount = degradedNow
    ? Math.max(degradedWeekCount, previous?.degradedWeekCount ?? 0)
    : 0;
  // 최근 창 이전 주차들의 최대 오차. 단발 급등을 지속 악화와 구분하는 기준이다.
  const priorErrors = points
    .slice(-mediumWindowWeeks, -shortWindowWeeks)
    .map((entry) => entry.absoluteErrorKrwPerL);
  const priorMaxAbsoluteError = priorErrors.length === 0 ? null : Math.max(...priorErrors);
  const reasons: PerformanceDriftReason[] = [
    ...(degradedNow ? (["recent-mae-up"] as const) : []),
    ...(mapeUp ? (["recent-mape-up"] as const) : []),
    ...(carriedCount >= DRIFT_ALERT_MIN_WEEKS ? (["repeated-degradation"] as const) : []),
    // 한 주의 큰 오차는 지속 악화와 구분해 보조 경고로만 남긴다.
    ...(short.maxAbsoluteErrorKrwPerL !== null &&
    priorMaxAbsoluteError !== null &&
    short.maxAbsoluteErrorKrwPerL > priorMaxAbsoluteError &&
    !degradedNow
      ? (["single-large-error"] as const)
      : []),
    ...(short.directionAccuracyRatio !== null &&
    medium.directionAccuracyRatio !== null &&
    short.directionAccuracyRatio < medium.directionAccuracyRatio / 2
      ? (["direction-accuracy-down"] as const)
      : []),
  ];
  // 한 주만 나쁜 경우는 관찰까지만 올리고, 새 주차에서 반복될 때 악화로 본다.
  const status: PerformanceDriftStatus = !degradedNow
    ? "stable"
    : carriedCount >= DRIFT_ALERT_MIN_WEEKS
      ? "alert"
      : "watch";

  return {
    version: PERFORMANCE_DRIFT_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    status,
    degradedWeekCount: carriedCount,
    lastEvaluatedWeekEndDate: latestWeekEndDate,
    short,
    medium,
    long,
    reasons,
  };
}

const WindowSchema = z.object({
  windowWeeks: z.number(),
  sampleCount: z.number(),
  maeKrwPerL: z.number().nullable(),
  mapePct: z.number().nullable(),
  maxAbsoluteErrorKrwPerL: z.number().nullable(),
  directionAccuracyRatio: z.number().nullable(),
});

const PerformanceDriftMetadataSchema = z.object({
  model: z.object({
    performanceDrift: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      status: z.enum(["stable", "watch", "alert", "undecided"]),
      degradedWeekCount: z.number(),
      lastEvaluatedWeekEndDate: z.string().nullable(),
      short: WindowSchema,
      medium: WindowSchema,
      long: WindowSchema,
      reasons: z.array(
        z.enum([
          "recent-mae-up",
          "recent-mape-up",
          "repeated-degradation",
          "single-large-error",
          "direction-accuracy-down",
          "insufficient-sample",
        ]),
      ),
    }),
  }),
});

/** 이 기능 적용 이전 run에는 블록이 없으므로 null이어야 한다. */
export function readPerformanceDrift(metadata: unknown): PerformanceDrift | null {
  const parsed = PerformanceDriftMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.performanceDrift : null;
}
