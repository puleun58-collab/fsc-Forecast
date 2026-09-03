import { z } from "zod";

import { calculateQuantile } from "./run-walk-forward-backtest";
import { HORIZON_BANDS } from "./horizon-performance";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

export const PREDICTION_INTERVAL_VERSION = 1;
/** 목표 적중률. "반드시 이 안에 들어온다"는 뜻이 아니다. */
export const PREDICTION_INTERVAL_TARGET_COVERAGE = 0.8;
/** calibration에 사용할 최근 residual 개수. */
export const PREDICTION_INTERVAL_CALIBRATION_WINDOW = 26;
/** 이보다 적으면 해당 예측 거리 자체 표본으로 범위를 만들지 않는다. */
export const PREDICTION_INTERVAL_MIN_CALIBRATION_SAMPLES = 8;
/** 목표 적중률과 이 차이 이내면 적정으로 본다. */
export const PREDICTION_INTERVAL_COVERAGE_TOLERANCE = 0.075;
/** 적중률 판정을 시작할 최소 표본. */
export const PREDICTION_INTERVAL_MIN_COVERAGE_SAMPLES = 8;

export type PredictionIntervalSource = "horizon" | "band" | "pooled" | "none";

export type PredictionIntervalStatus =
  | "calibrated"
  | "too-narrow"
  | "too-wide"
  | "validating"
  | "insufficient-sample";

export interface PredictionIntervalHorizon {
  horizonWeeks: number;
  calibrationSampleCount: number;
  lowerResidualQuantileKrwPerL: number | null;
  upperResidualQuantileKrwPerL: number | null;
  source: PredictionIntervalSource;
  coverageSampleCount: number;
  coverageHitCount: number;
  coverageRatio: number | null;
  averageIntervalWidthKrwPerL: number | null;
  status: PredictionIntervalStatus;
}

export interface PredictionIntervalCalibration {
  version: number;
  evaluatedAt: string;
  targetCoverage: number;
  calibrationWindow: number;
  horizons: PredictionIntervalHorizon[];
  /** 표본 수가 다른 horizon을 단순 평균하지 않도록 가중 적중률을 따로 둔다. */
  weightedCoverageRatio: number | null;
  weightedCoverageSampleCount: number;
}

function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function bandOf(horizonWeeks: number): (typeof HORIZON_BANDS)[number] | undefined {
  return HORIZON_BANDS.find((band) => horizonWeeks >= band.from && horizonWeeks <= band.to);
}

interface CalibrationSet {
  residuals: number[];
  source: PredictionIntervalSource;
}

/**
 * 발행 시점 이전에 실제값이 확정된 residual만 모은다.
 * 자체 표본이 부족하면 같은 구간 → 전체 순으로만 넓힌다.
 */
export function collectCalibrationResiduals(
  history: readonly WalkForwardEvaluationPoint[],
  horizonWeeks: number,
  window = PREDICTION_INTERVAL_CALIBRATION_WINDOW,
  minimumSamples = PREDICTION_INTERVAL_MIN_CALIBRATION_SAMPLES,
): CalibrationSet {
  const residualOf = (point: WalkForwardEvaluationPoint) =>
    point.actualKrwPerL - point.forecastKrwPerL;
  const own = history.filter((point) => point.horizonIndex === horizonWeeks);

  if (own.length >= minimumSamples) {
    return { residuals: own.slice(-window).map(residualOf), source: "horizon" };
  }

  const band = bandOf(horizonWeeks);
  const banded =
    band === undefined
      ? []
      : history.filter(
          (point) => point.horizonIndex >= band.from && point.horizonIndex <= band.to,
        );

  if (banded.length >= minimumSamples) {
    return { residuals: banded.slice(-window).map(residualOf), source: "band" };
  }

  return history.length >= minimumSamples
    ? { residuals: history.slice(-window).map(residualOf), source: "pooled" }
    : { residuals: [], source: "none" };
}

export interface PredictionIntervalBounds {
  lowerKrwPerL: number;
  upperKrwPerL: number;
  lowerResidualQuantileKrwPerL: number;
  upperResidualQuantileKrwPerL: number;
  calibrationSampleCount: number;
  source: PredictionIntervalSource;
}

/** 중심 예측은 그대로 두고 잔차 분포로 비대칭 범위만 만든다. */
export function buildPredictionIntervalBounds(
  forecastKrwPerL: number,
  residuals: readonly number[],
  source: PredictionIntervalSource,
  targetCoverage = PREDICTION_INTERVAL_TARGET_COVERAGE,
): PredictionIntervalBounds | null {
  if (residuals.length === 0 || source === "none") {
    return null;
  }

  const tail = (1 - targetCoverage) / 2;
  const sorted = [...residuals].sort((left, right) => left - right);
  const lowerResidual = calculateQuantile(sorted, tail);
  const upperResidual = calculateQuantile(sorted, 1 - tail);

  if (lowerResidual === null || upperResidual === null) {
    return null;
  }

  return {
    lowerKrwPerL: forecastKrwPerL + lowerResidual,
    upperKrwPerL: forecastKrwPerL + upperResidual,
    lowerResidualQuantileKrwPerL: lowerResidual,
    upperResidualQuantileKrwPerL: upperResidual,
    calibrationSampleCount: residuals.length,
    source,
  };
}

function resolveStatus(
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

export interface BuildPredictionIntervalInput {
  evaluationPoints: readonly WalkForwardEvaluationPoint[];
  horizonCount: number;
  evaluatedAt: Date;
  targetCoverage?: number;
  calibrationWindow?: number;
}

/**
 * 각 평가 지점마다 그 시점 이전 residual만으로 범위를 만들고 실제값 적중을 기록한다.
 * 최신 residual을 과거 범위에 소급 적용하지 않으므로 미래 데이터 누수가 없다.
 */
export function buildPredictionIntervalCalibration({
  evaluationPoints,
  horizonCount,
  evaluatedAt,
  targetCoverage = PREDICTION_INTERVAL_TARGET_COVERAGE,
  calibrationWindow = PREDICTION_INTERVAL_CALIBRATION_WINDOW,
}: BuildPredictionIntervalInput): PredictionIntervalCalibration {
  const ordered = [...evaluationPoints].sort(
    (left, right) =>
      left.originWeekEndDate.getTime() - right.originWeekEndDate.getTime() ||
      left.horizonIndex - right.horizonIndex,
  );
  const stats = new Map<
    number,
    {
      coverageSampleCount: number;
      coverageHitCount: number;
      widths: number[];
      calibrationSampleCount: number;
      lowerResidual: number | null;
      upperResidual: number | null;
      source: PredictionIntervalSource;
    }
  >();

  for (const point of ordered) {
    if (point.horizonIndex < 1 || point.horizonIndex > horizonCount) {
      continue;
    }

    // 이 예측이 발행된 시점에 이미 실제값이 확정된 지점만 calibration에 쓴다.
    const history = ordered.filter(
      (candidate) => candidate.targetDate.getTime() <= point.originWeekEndDate.getTime(),
    );
    const calibration = collectCalibrationResiduals(history, point.horizonIndex, calibrationWindow);
    const bounds = buildPredictionIntervalBounds(
      point.forecastKrwPerL,
      calibration.residuals,
      calibration.source,
      targetCoverage,
    );
    const entry = stats.get(point.horizonIndex) ?? {
      coverageSampleCount: 0,
      coverageHitCount: 0,
      widths: [] as number[],
      calibrationSampleCount: 0,
      lowerResidual: null as number | null,
      upperResidual: null as number | null,
      source: "none" as PredictionIntervalSource,
    };

    if (bounds !== null) {
      const hit =
        point.actualKrwPerL >= bounds.lowerKrwPerL && point.actualKrwPerL <= bounds.upperKrwPerL;

      entry.coverageSampleCount += 1;
      entry.coverageHitCount += hit ? 1 : 0;
      entry.widths.push(bounds.upperKrwPerL - bounds.lowerKrwPerL);
      entry.calibrationSampleCount = bounds.calibrationSampleCount;
      entry.lowerResidual = bounds.lowerResidualQuantileKrwPerL;
      entry.upperResidual = bounds.upperResidualQuantileKrwPerL;
      entry.source = bounds.source;
    }

    stats.set(point.horizonIndex, entry);
  }

  const horizons = [...stats.entries()]
    .sort(([left], [right]) => left - right)
    .map(([horizonWeeks, entry]): PredictionIntervalHorizon => {
      const coverageRatio =
        entry.coverageSampleCount === 0
          ? null
          : Math.round((entry.coverageHitCount / entry.coverageSampleCount) * 10_000) / 10_000;

      return {
        horizonWeeks,
        calibrationSampleCount: entry.calibrationSampleCount,
        lowerResidualQuantileKrwPerL: round(entry.lowerResidual),
        upperResidualQuantileKrwPerL: round(entry.upperResidual),
        source: entry.source,
        coverageSampleCount: entry.coverageSampleCount,
        coverageHitCount: entry.coverageHitCount,
        coverageRatio,
        averageIntervalWidthKrwPerL:
          entry.widths.length === 0
            ? null
            : round(entry.widths.reduce((sum, value) => sum + value, 0) / entry.widths.length),
        status: resolveStatus(entry.coverageSampleCount, coverageRatio, targetCoverage),
      };
    });
  const weightedSampleCount = horizons.reduce(
    (total, horizon) => total + horizon.coverageSampleCount,
    0,
  );
  const weightedHitCount = horizons.reduce((total, horizon) => total + horizon.coverageHitCount, 0);

  return {
    version: PREDICTION_INTERVAL_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    targetCoverage,
    calibrationWindow,
    horizons,
    weightedCoverageRatio:
      weightedSampleCount === 0
        ? null
        : Math.round((weightedHitCount / weightedSampleCount) * 10_000) / 10_000,
    weightedCoverageSampleCount: weightedSampleCount,
  };
}

const HorizonSchema = z.object({
  horizonWeeks: z.number(),
  calibrationSampleCount: z.number(),
  lowerResidualQuantileKrwPerL: z.number().nullable(),
  upperResidualQuantileKrwPerL: z.number().nullable(),
  source: z.enum(["horizon", "band", "pooled", "none"]),
  coverageSampleCount: z.number(),
  coverageHitCount: z.number(),
  coverageRatio: z.number().nullable(),
  averageIntervalWidthKrwPerL: z.number().nullable(),
  status: z.enum(["calibrated", "too-narrow", "too-wide", "validating", "insufficient-sample"]),
});

const PredictionIntervalMetadataSchema = z.object({
  model: z.object({
    predictionInterval: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      targetCoverage: z.number(),
      calibrationWindow: z.number(),
      horizons: z.array(HorizonSchema),
      weightedCoverageRatio: z.number().nullable(),
      weightedCoverageSampleCount: z.number(),
    }),
  }),
});

/** 이 기능 적용 이전 run에는 블록이 없으므로 null이어야 한다. */
export function readPredictionIntervalCalibration(
  metadata: unknown,
): PredictionIntervalCalibration | null {
  const parsed = PredictionIntervalMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.predictionInterval : null;
}
