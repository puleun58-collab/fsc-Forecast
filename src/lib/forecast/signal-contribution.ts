import { z } from "zod";

import { createCandidateEvaluator } from "./candidate-backtest";
import type { ForecastModelParams } from "./forecast-model-config";
import type {
  RunWalkForwardBacktestResult,
  WalkForwardEvaluationPoint,
} from "./run-walk-forward-backtest";
import type { ForecastDailyPriceRow } from "./types";

export const SIGNAL_CONTRIBUTION_VERSION = 1;

export type ForecastSignalKey = "trend" | "dubai" | "usdKrw" | "bias" | "dailySignal";

export type SignalContributionStatus =
  | "helpful"
  | "harmful"
  | "mixed"
  | "neutral"
  | "insufficient-sample"
  | "not-used"
  | "not-separable";

export interface SignalContributionWindow {
  windowWeeks: number;
  /** 두 모델이 모두 계산된 주차만 센다. */
  sampleCount: number;
  baselineMaeKrwPerL: number | null;
  ablatedMaeKrwPerL: number | null;
  /** 제거 모델 - 현재 모델. 양수면 신호가 오차를 줄이고 있었다는 뜻이다. */
  maeContributionKrwPerL: number | null;
  baselineMapePct: number | null;
  ablatedMapePct: number | null;
  mapeContributionPctPoint: number | null;
}

export interface SignalContribution {
  signal: ForecastSignalKey;
  status: SignalContributionStatus;
  recent: SignalContributionWindow | null;
  long: SignalContributionWindow | null;
}

export interface ForecastSignalContribution {
  version: number;
  evaluatedAt: string;
  recentWindowWeeks: number;
  longWindowWeeks: number;
  signals: SignalContribution[];
}

export const SIGNAL_ORDER: readonly ForecastSignalKey[] = [
  "trend",
  "dubai",
  "usdKrw",
  "bias",
  "dailySignal",
];

/** 표시 정밀도(0.01)에서 의미 없는 차이는 차이 없음으로 본다. */
function roundForDisplay(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

/** 신호 하나만 뺀 파라미터. Trend는 공식의 골격이라 독립 제거본을 만들 수 없다. */
export function ablateSignal(
  params: ForecastModelParams,
  signal: ForecastSignalKey,
): ForecastModelParams | null {
  switch (signal) {
    case "dubai":
      // Dubai가 빠지면 USD/KRW 보정도 성립하지 않는 현재 모델 구조를 그대로 따른다.
      return { ...params, dubai: null, usdKrw: null, modelId: "A" };
    case "usdKrw":
      return { ...params, usdKrw: null, modelId: params.dubai === null ? "A" : "B" };
    case "bias":
      return { ...params, biasCorrection: null };
    case "dailySignal":
      return { ...params, dailySignal: null };
    case "trend":
      return null;
  }
}

export function isSignalActive(params: ForecastModelParams, signal: ForecastSignalKey): boolean {
  switch (signal) {
    case "dubai":
      return params.dubai !== null;
    case "usdKrw":
      return params.usdKrw !== null;
    case "bias":
      return params.biasCorrection !== null;
    case "dailySignal":
      return params.dailySignal !== null;
    case "trend":
      return true;
  }
}

/** 해당 origin에서 신호가 실제로 쓰였는지. 쓰이지 않은 주차는 기여 표본이 아니다. */
function wasSignalUsed(
  signal: ForecastSignalKey,
  baseline: WalkForwardEvaluationPoint,
  ablated: WalkForwardEvaluationPoint,
): boolean {
  switch (signal) {
    case "dubai":
      return baseline.dubaiContributionRatio !== null;
    case "usdKrw":
      return baseline.usdKrwContributionRatio !== null;
    case "bias":
    case "dailySignal":
      // 사후 보정은 예측값이 실제로 달라진 주차에서만 효과가 있다.
      return baseline.forecastKrwPerL !== ablated.forecastKrwPerL;
    case "trend":
      return false;
  }
}

interface PairedPoint {
  baseline: WalkForwardEvaluationPoint;
  ablated: WalkForwardEvaluationPoint;
}

/** 두 모델 모두 계산된 같은 주차만 짝지어 비교한다. */
function pairPoints(
  signal: ForecastSignalKey,
  baselinePoints: readonly WalkForwardEvaluationPoint[],
  ablatedPoints: readonly WalkForwardEvaluationPoint[],
): PairedPoint[] {
  const ablatedByTarget = new Map(
    ablatedPoints
      .filter((point) => point.horizonIndex === 1)
      .map((point) => [point.targetDate.toISOString(), point]),
  );

  return baselinePoints
    .filter((point) => point.horizonIndex === 1)
    .flatMap((baseline) => {
      const ablated = ablatedByTarget.get(baseline.targetDate.toISOString());

      return ablated === undefined || !wasSignalUsed(signal, baseline, ablated)
        ? []
        : [{ baseline, ablated }];
    });
}

function meanAbsoluteError(points: readonly WalkForwardEvaluationPoint[]): number | null {
  return points.length === 0
    ? null
    : points.reduce((total, point) => total + point.absoluteErrorKrwPerL, 0) / points.length;
}

function meanAbsolutePercentageError(points: readonly WalkForwardEvaluationPoint[]): number | null {
  const values = points.flatMap((point) =>
    point.absolutePercentageErrorPct === null ? [] : [point.absolutePercentageErrorPct],
  );

  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function summarizePairedWindow(
  pairs: readonly PairedPoint[],
  windowWeeks: number,
): SignalContributionWindow {
  const window = pairs.slice(-windowWeeks);
  const baselineMae = roundForDisplay(meanAbsoluteError(window.map((pair) => pair.baseline)));
  const ablatedMae = roundForDisplay(meanAbsoluteError(window.map((pair) => pair.ablated)));
  const baselineMape = roundForDisplay(
    meanAbsolutePercentageError(window.map((pair) => pair.baseline)),
  );
  const ablatedMape = roundForDisplay(
    meanAbsolutePercentageError(window.map((pair) => pair.ablated)),
  );

  return {
    windowWeeks,
    sampleCount: window.length,
    baselineMaeKrwPerL: baselineMae,
    ablatedMaeKrwPerL: ablatedMae,
    maeContributionKrwPerL:
      baselineMae === null || ablatedMae === null ? null : roundForDisplay(ablatedMae - baselineMae),
    baselineMapePct: baselineMape,
    ablatedMapePct: ablatedMape,
    mapeContributionPctPoint:
      baselineMape === null || ablatedMape === null
        ? null
        : roundForDisplay(ablatedMape - baselineMape),
  };
}

function directionOf(value: number | null): -1 | 0 | 1 | null {
  if (value === null) {
    return null;
  }

  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** 두 구간과 두 지표의 방향이 모두 같을 때만 도움/악화로 단정한다. */
export function resolveContributionStatus(
  recent: SignalContributionWindow,
  long: SignalContributionWindow,
  minimumSampleCount: number,
): SignalContributionStatus {
  if (recent.sampleCount < minimumSampleCount || recent.maeContributionKrwPerL === null) {
    return "insufficient-sample";
  }

  const directions = [
    directionOf(recent.maeContributionKrwPerL),
    directionOf(long.maeContributionKrwPerL),
    directionOf(recent.mapeContributionPctPoint),
    directionOf(long.mapeContributionPctPoint),
  ].filter((direction): direction is -1 | 0 | 1 => direction !== null);
  const nonZero = directions.filter((direction) => direction !== 0);

  if (nonZero.length === 0) {
    return "neutral";
  }

  if (nonZero.every((direction) => direction === 1)) {
    return "helpful";
  }

  return nonZero.every((direction) => direction === -1) ? "harmful" : "mixed";
}

export interface BuildSignalContributionInput {
  currentParams: ForecastModelParams;
  currentBacktest: RunWalkForwardBacktestResult;
  /** 파이프라인의 walk-forward 평가 함수. 같은 params는 다시 실행되지 않는다. */
  evaluate: (params: ForecastModelParams) => RunWalkForwardBacktestResult | null;
  dailyPrices: readonly ForecastDailyPriceRow[];
  evaluatedAt: Date;
  minimumSampleCount?: number;
}

/**
 * 현재 운영 설정에서 신호를 하나씩만 빼고 같은 주차로 다음 주 예측 성능을 비교한다.
 * 진단 전용이며 운영 파라미터·후보 선정에는 사용하지 않는다.
 */
export function buildSignalContribution({
  currentParams,
  currentBacktest,
  evaluate,
  dailyPrices,
  evaluatedAt,
  minimumSampleCount = 3,
}: BuildSignalContributionInput): ForecastSignalContribution {
  const recentWindowWeeks = currentBacktest.recentOneStep.windowWeeks;
  const longWindowWeeks = currentBacktest.longOneStep.windowWeeks;
  const evaluateCached = createCandidateEvaluator({
    evaluate,
    dailyPrices,
    recentWindowWeeks,
    longWindowWeeks,
  });
  const signals = SIGNAL_ORDER.map((signal): SignalContribution => {
    const ablatedParams = ablateSignal(currentParams, signal);

    if (ablatedParams === null) {
      return { signal, status: "not-separable", recent: null, long: null };
    }

    if (!isSignalActive(currentParams, signal)) {
      return { signal, status: "not-used", recent: null, long: null };
    }

    const ablated = evaluateCached(ablatedParams);

    if (ablated === null) {
      return { signal, status: "insufficient-sample", recent: null, long: null };
    }

    const pairs = pairPoints(signal, currentBacktest.oneStepPoints, ablated.oneStepPoints);
    const recent = summarizePairedWindow(pairs, recentWindowWeeks);
    const long = summarizePairedWindow(pairs, longWindowWeeks);

    return {
      signal,
      status: resolveContributionStatus(recent, long, minimumSampleCount),
      recent,
      long,
    };
  });

  return {
    version: SIGNAL_CONTRIBUTION_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    recentWindowWeeks,
    longWindowWeeks,
    signals,
  };
}

const WindowSchema = z.object({
  windowWeeks: z.number(),
  sampleCount: z.number(),
  baselineMaeKrwPerL: z.number().nullable(),
  ablatedMaeKrwPerL: z.number().nullable(),
  maeContributionKrwPerL: z.number().nullable(),
  baselineMapePct: z.number().nullable(),
  ablatedMapePct: z.number().nullable(),
  mapeContributionPctPoint: z.number().nullable(),
});

const SignalContributionMetadataSchema = z.object({
  model: z.object({
    signalContribution: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      recentWindowWeeks: z.number(),
      longWindowWeeks: z.number(),
      signals: z.array(
        z.object({
          signal: z.enum(["trend", "dubai", "usdKrw", "bias", "dailySignal"]),
          status: z.enum([
            "helpful",
            "harmful",
            "mixed",
            "neutral",
            "insufficient-sample",
            "not-used",
            "not-separable",
          ]),
          recent: WindowSchema.nullable(),
          long: WindowSchema.nullable(),
        }),
      ),
    }),
  }),
});

/** 이 기능 적용 이전 run에는 블록이 없으므로 null이어야 한다. */
export function readSignalContribution(metadata: unknown): ForecastSignalContribution | null {
  const parsed = SignalContributionMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.signalContribution : null;
}
