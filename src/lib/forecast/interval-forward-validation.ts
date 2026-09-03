import { z } from "zod";

import {
  PREDICTION_INTERVAL_COVERAGE_TOLERANCE,
  PREDICTION_INTERVAL_MIN_COVERAGE_SAMPLES,
  PREDICTION_INTERVAL_TARGET_COVERAGE,
  PREDICTION_INTERVAL_VERSION,
  type PredictionIntervalSource,
  type PredictionIntervalStatus,
} from "./prediction-interval";

export const INTERVAL_FORWARD_VALIDATION_VERSION = 1;

export interface IssuedIntervalPoint {
  horizonWeeks: number;
  originWeekEndDate: Date;
  targetDate: Date;
  issuedAt: Date;
  forecastKrwPerL: number;
  lowerKrwPerL: number;
  upperKrwPerL: number;
  calibrationSampleCount: number;
  source: PredictionIntervalSource;
}

export interface IntervalForwardObservation {
  horizonWeeks: number;
  originWeekEndDate: string;
  targetDate: string;
  issuedAt: string;
  forecastKrwPerL: number;
  lowerKrwPerL: number;
  upperKrwPerL: number;
  actualKrwPerL: number | null;
  hit: boolean | null;
  intervalVersion: number;
  calibrationSampleCount: number;
  calibrationSource: PredictionIntervalSource;
}

export interface IntervalForwardValidation {
  version: number;
  targetCoverage: number;
  observations: IntervalForwardObservation[];
}

export type IntervalPublicationStatus = "eligible" | "pending";

export interface IntervalForwardHorizonSummary {
  horizonWeeks: number;
  coverageSampleCount: number;
  coverageHitCount: number;
  coverageRatio: number | null;
  averageIntervalWidthKrwPerL: number | null;
  pendingSampleCount: number;
  status: PredictionIntervalStatus;
  publication: IntervalPublicationStatus;
}

function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

export interface RecordIntervalForwardCycleInput {
  previous: IntervalForwardValidation | null;
  /** 이번 실행에서 발행한 예측 범위. 이미 기록된 target은 덮어쓰지 않는다. */
  issued: readonly IssuedIntervalPoint[];
  confirmedWeeks: readonly { targetDate: Date; actualKrwPerL: number }[];
  targetCoverage?: number;
  /** 오래된 관측을 무한히 쌓지 않도록 최근 것만 남긴다. */
  limit?: number;
}

/**
 * 발행 당시 저장한 범위만으로 적중을 판정한다.
 * 최신 residual로 과거 범위를 다시 만들지 않으며, 같은 target을 두 번 세지 않는다.
 */
export function recordIntervalForwardCycle({
  previous,
  issued,
  confirmedWeeks,
  targetCoverage = PREDICTION_INTERVAL_TARGET_COVERAGE,
  limit = 13 * 13,
}: RecordIntervalForwardCycleInput): IntervalForwardValidation {
  const actualByTargetDate = new Map(
    confirmedWeeks.map((week) => [week.targetDate.toISOString(), week.actualKrwPerL]),
  );
  const observations = (previous?.observations ?? []).map((observation) => {
    if (observation.actualKrwPerL !== null) {
      return observation;
    }

    const actualKrwPerL = actualByTargetDate.get(observation.targetDate);

    return actualKrwPerL === undefined
      ? observation
      : {
          ...observation,
          actualKrwPerL,
          hit:
            actualKrwPerL >= observation.lowerKrwPerL && actualKrwPerL <= observation.upperKrwPerL,
        };
  });
  const known = new Set(
    observations.map((observation) => `${observation.horizonWeeks}@${observation.targetDate}`),
  );

  for (const point of issued) {
    const targetDate = point.targetDate.toISOString();
    const key = `${point.horizonWeeks}@${targetDate}`;

    if (known.has(key) || actualByTargetDate.has(targetDate)) {
      continue;
    }

    known.add(key);
    observations.push({
      horizonWeeks: point.horizonWeeks,
      originWeekEndDate: point.originWeekEndDate.toISOString(),
      targetDate,
      issuedAt: point.issuedAt.toISOString(),
      forecastKrwPerL: point.forecastKrwPerL,
      lowerKrwPerL: point.lowerKrwPerL,
      upperKrwPerL: point.upperKrwPerL,
      actualKrwPerL: null,
      hit: null,
      intervalVersion: PREDICTION_INTERVAL_VERSION,
      calibrationSampleCount: point.calibrationSampleCount,
      calibrationSource: point.source,
    });
  }

  return {
    version: INTERVAL_FORWARD_VALIDATION_VERSION,
    targetCoverage,
    observations: observations
      .sort((left, right) => left.targetDate.localeCompare(right.targetDate))
      .slice(-limit),
  };
}

export function summarizeIntervalForwardValidation(
  validation: IntervalForwardValidation | null,
): IntervalForwardHorizonSummary[] {
  if (validation === null) {
    return [];
  }

  const byHorizon = new Map<number, IntervalForwardObservation[]>();

  for (const observation of validation.observations) {
    const bucket = byHorizon.get(observation.horizonWeeks);

    if (bucket === undefined) {
      byHorizon.set(observation.horizonWeeks, [observation]);
      continue;
    }

    bucket.push(observation);
  }

  return [...byHorizon.entries()]
    .sort(([left], [right]) => left - right)
    .map(([horizonWeeks, observations]): IntervalForwardHorizonSummary => {
      const resolved = observations.filter((observation) => observation.hit !== null);
      const hitCount = resolved.filter((observation) => observation.hit === true).length;
      const coverageRatio =
        resolved.length === 0 ? null : Math.round((hitCount / resolved.length) * 10_000) / 10_000;
      const widths = observations.map(
        (observation) => observation.upperKrwPerL - observation.lowerKrwPerL,
      );
      const status = resolveForwardIntervalStatus(
        resolved.length,
        coverageRatio,
        validation.targetCoverage,
      );

      return {
        horizonWeeks,
        coverageSampleCount: resolved.length,
        coverageHitCount: hitCount,
        coverageRatio,
        averageIntervalWidthKrwPerL:
          widths.length === 0
            ? null
            : round(widths.reduce((sum, value) => sum + value, 0) / widths.length),
        pendingSampleCount: observations.length - resolved.length,
        status,
        // 검증이 충분하고 목표 적중률 부근일 때만 공개 후보가 된다.
        publication: status === "calibrated" ? "eligible" : "pending",
      };
    });
}

/** 기존 예측 범위 판정 기준을 그대로 쓴다. 공개용 새 임계값을 만들지 않는다. */
export function resolveForwardIntervalStatus(
  coverageSampleCount: number,
  coverageRatio: number | null,
  targetCoverage: number,
): PredictionIntervalStatus {
  if (coverageSampleCount === 0 || coverageRatio === null) {
    return "insufficient-sample";
  }

  if (coverageSampleCount < PREDICTION_INTERVAL_MIN_COVERAGE_SAMPLES) {
    return "validating";
  }

  if (coverageRatio < targetCoverage - PREDICTION_INTERVAL_COVERAGE_TOLERANCE) {
    return "too-narrow";
  }

  return coverageRatio > targetCoverage + PREDICTION_INTERVAL_COVERAGE_TOLERANCE
    ? "too-wide"
    : "calibrated";
}

/** 공개 설정이 켜져 있어도 검증을 통과한 예측 거리만 노출한다. */
export function selectPublishableHorizonWeeks(
  validation: IntervalForwardValidation | null,
  publicationEnabled: boolean,
): number[] {
  return publicationEnabled
    ? summarizeIntervalForwardValidation(validation)
        .filter((summary) => summary.publication === "eligible")
        .map((summary) => summary.horizonWeeks)
    : [];
}

const ObservationSchema = z.object({
  horizonWeeks: z.number(),
  originWeekEndDate: z.string(),
  targetDate: z.string(),
  issuedAt: z.string(),
  forecastKrwPerL: z.number(),
  lowerKrwPerL: z.number(),
  upperKrwPerL: z.number(),
  actualKrwPerL: z.number().nullable(),
  hit: z.boolean().nullable(),
  intervalVersion: z.number(),
  calibrationSampleCount: z.number(),
  calibrationSource: z.enum(["horizon", "band", "pooled", "none"]),
});

const IntervalForwardMetadataSchema = z.object({
  model: z.object({
    intervalForwardValidation: z.object({
      version: z.number(),
      targetCoverage: z.number(),
      observations: z.array(ObservationSchema),
    }),
  }),
});

/** 이 기능 적용 이전 run에는 블록이 없으므로 null이어야 한다. */
export function readIntervalForwardValidation(
  metadata: unknown,
): IntervalForwardValidation | null {
  const parsed = IntervalForwardMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.intervalForwardValidation : null;
}
