import { z } from "zod";

import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

export const HORIZON_PERFORMANCE_VERSION = 1;
/** 이 개수보다 적으면 해당 예측 거리를 평가하지 않는다. */
export const HORIZON_MIN_SAMPLE_COUNT = 5;
/** 근거리 평균 대비 이 비율 이상 오차가 커지면 저하 구간으로 본다. */
export const HORIZON_DEGRADATION_RATIO = 1.5;

export const HORIZON_BANDS = [
  { key: "near", label: "근거리", from: 1, to: 4 },
  { key: "mid", label: "중거리", from: 5, to: 8 },
  { key: "long", label: "장거리", from: 9, to: 13 },
] as const;

export type HorizonBandKey = (typeof HORIZON_BANDS)[number]["key"];

export type HorizonStatus = "stable" | "watch" | "volatile" | "insufficient-sample";

export interface HorizonPerformanceEntry {
  horizonWeeks: number;
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  directionAccuracyRatio: number | null;
  status: HorizonStatus;
}

export interface HorizonBandSummary {
  band: HorizonBandKey;
  fromHorizonWeeks: number;
  toHorizonWeeks: number;
  sampleCount: number;
  maeKrwPerL: number | null;
}

export interface HorizonPerformance {
  version: number;
  evaluatedAt: string;
  horizons: HorizonPerformanceEntry[];
  bands: HorizonBandSummary[];
  /** 오차가 눈에 띄게 커지기 시작하는 예측 거리. 판단이 애매하면 null. */
  degradationStartHorizonWeeks: number | null;
  /** 참고용 전체 horizon 통합값. 개별 horizon 수치를 대체하지 않는다. */
  overall: { sampleCount: number; maeKrwPerL: number | null; mapePct: number | null };
}

function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeHorizon(
  horizonWeeks: number,
  points: readonly WalkForwardEvaluationPoint[],
): Omit<HorizonPerformanceEntry, "status"> {
  const errors = points.map((point) => point.absoluteErrorKrwPerL);
  const apes = points.flatMap((point) =>
    point.absolutePercentageErrorPct === null ? [] : [point.absolutePercentageErrorPct],
  );
  const directionHits = points.filter(
    (point) => point.forecastDirection === point.actualDirection,
  ).length;

  return {
    horizonWeeks,
    sampleCount: points.length,
    maeKrwPerL: round(average(errors)),
    mapePct: round(average(apes)),
    maxAbsoluteErrorKrwPerL: errors.length === 0 ? null : round(Math.max(...errors)),
    directionAccuracyRatio:
      points.length === 0 ? null : Math.round((directionHits / points.length) * 1000) / 1000,
  };
}

/** 상태는 절대 임계값이 아니라 근거리 성능 대비 상대 변화로만 판단한다. */
function resolveStatus(
  entry: Omit<HorizonPerformanceEntry, "status">,
  nearMae: number | null,
  minimumSampleCount: number,
): HorizonStatus {
  if (entry.sampleCount < minimumSampleCount || entry.maeKrwPerL === null) {
    return "insufficient-sample";
  }

  if (nearMae === null || nearMae === 0) {
    return "stable";
  }

  const ratio = entry.maeKrwPerL / nearMae;

  if (ratio >= HORIZON_DEGRADATION_RATIO * 1.5) {
    return "volatile";
  }

  return ratio >= HORIZON_DEGRADATION_RATIO ? "watch" : "stable";
}

export interface BuildHorizonPerformanceInput {
  /** 모든 horizon의 walk-forward 평가 지점. 실제값이 확정된 지점만 들어온다. */
  evaluationPoints: readonly WalkForwardEvaluationPoint[];
  horizonCount: number;
  evaluatedAt: Date;
  minimumSampleCount?: number;
}

/**
 * 예측 거리별로 성능을 분리해 보여주는 진단 계산이다.
 * 모델 선택·후보 ranking·신뢰도에는 사용하지 않는다.
 */
export function buildHorizonPerformance({
  evaluationPoints,
  horizonCount,
  evaluatedAt,
  minimumSampleCount = HORIZON_MIN_SAMPLE_COUNT,
}: BuildHorizonPerformanceInput): HorizonPerformance {
  const byHorizon = new Map<number, WalkForwardEvaluationPoint[]>();

  for (const point of evaluationPoints) {
    if (point.horizonIndex < 1 || point.horizonIndex > horizonCount) {
      continue;
    }

    const bucket = byHorizon.get(point.horizonIndex);

    if (bucket === undefined) {
      byHorizon.set(point.horizonIndex, [point]);
      continue;
    }

    bucket.push(point);
  }

  const summaries = Array.from({ length: horizonCount }, (_, index) =>
    summarizeHorizon(index + 1, byHorizon.get(index + 1) ?? []),
  ).filter((entry) => entry.sampleCount > 0);
  const nearMae = average(
    summaries
      .filter((entry) => entry.horizonWeeks <= HORIZON_BANDS[0].to && entry.sampleCount >= minimumSampleCount)
      .flatMap((entry) => (entry.maeKrwPerL === null ? [] : [entry.maeKrwPerL])),
  );
  const horizons = summaries.map((entry) => ({
    ...entry,
    status: resolveStatus(entry, nearMae, minimumSampleCount),
  }));
  const bands = HORIZON_BANDS.map((band): HorizonBandSummary => {
    const entries = horizons.filter(
      (entry) => entry.horizonWeeks >= band.from && entry.horizonWeeks <= band.to,
    );

    return {
      band: band.key,
      fromHorizonWeeks: band.from,
      toHorizonWeeks: band.to,
      sampleCount: entries.reduce((total, entry) => total + entry.sampleCount, 0),
      maeKrwPerL: round(
        average(entries.flatMap((entry) => (entry.maeKrwPerL === null ? [] : [entry.maeKrwPerL]))),
      ),
    };
  });
  const allErrors = evaluationPoints
    .filter((point) => point.horizonIndex >= 1 && point.horizonIndex <= horizonCount)
    .map((point) => point.absoluteErrorKrwPerL);
  const allApes = evaluationPoints.flatMap((point) =>
    point.absolutePercentageErrorPct === null ? [] : [point.absolutePercentageErrorPct],
  );

  return {
    version: HORIZON_PERFORMANCE_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    horizons,
    bands,
    degradationStartHorizonWeeks: findDegradationStart(horizons, nearMae, minimumSampleCount),
    overall: {
      sampleCount: allErrors.length,
      maeKrwPerL: round(average(allErrors)),
      mapePct: round(average(allApes)),
    },
  };
}

/** 근거리 평균 대비 오차가 커진 뒤 계속 커진 상태로 남는 첫 예측 거리만 고른다. */
export function findDegradationStart(
  horizons: readonly HorizonPerformanceEntry[],
  nearMae: number | null,
  minimumSampleCount: number,
): number | null {
  if (nearMae === null || nearMae === 0) {
    return null;
  }

  const evaluated = horizons.filter(
    (entry) => entry.sampleCount >= minimumSampleCount && entry.maeKrwPerL !== null,
  );

  for (const entry of evaluated) {
    if ((entry.maeKrwPerL ?? 0) < nearMae * HORIZON_DEGRADATION_RATIO) {
      continue;
    }

    const later = evaluated.filter((candidate) => candidate.horizonWeeks > entry.horizonWeeks);
    const staysHigh = later.every(
      (candidate) => (candidate.maeKrwPerL ?? 0) >= nearMae * HORIZON_DEGRADATION_RATIO,
    );

    if (staysHigh) {
      return entry.horizonWeeks;
    }
  }

  return null;
}

const HorizonSchema = z.object({
  horizonWeeks: z.number(),
  sampleCount: z.number(),
  maeKrwPerL: z.number().nullable(),
  mapePct: z.number().nullable(),
  maxAbsoluteErrorKrwPerL: z.number().nullable(),
  directionAccuracyRatio: z.number().nullable(),
  status: z.enum(["stable", "watch", "volatile", "insufficient-sample"]),
});

const HorizonPerformanceMetadataSchema = z.object({
  model: z.object({
    horizonPerformance: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      horizons: z.array(HorizonSchema),
      bands: z.array(
        z.object({
          band: z.enum(["near", "mid", "long"]),
          fromHorizonWeeks: z.number(),
          toHorizonWeeks: z.number(),
          sampleCount: z.number(),
          maeKrwPerL: z.number().nullable(),
        }),
      ),
      degradationStartHorizonWeeks: z.number().nullable(),
      overall: z.object({
        sampleCount: z.number(),
        maeKrwPerL: z.number().nullable(),
        mapePct: z.number().nullable(),
      }),
    }),
  }),
});

/** 이 기능 적용 이전 run에는 블록이 없으므로 null이어야 한다. */
export function readHorizonPerformance(metadata: unknown): HorizonPerformance | null {
  const parsed = HorizonPerformanceMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.horizonPerformance : null;
}
