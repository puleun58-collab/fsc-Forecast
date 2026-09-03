import { z } from "zod";

import { LONG_EVALUATION_WEEKS, RECENT_EVALUATION_WEEKS } from "./forecast-model-config";
import {
  calculateQuantile,
  summarizeWindow,
  type WalkForwardEvaluationPoint,
} from "./run-walk-forward-backtest";
import type { ForecastSeriesPoint } from "./types";

export const MARKET_REGIME_ANALYSIS_VERSION = 1;

/** 진단 전용 상수. Forecast/Model/신뢰도/FSC 계산에는 사용하지 않는다. */
export const MARKET_REGIME_TREND_LOOKBACK_WEEKS = 4;
export const MARKET_REGIME_REFERENCE_WINDOW_WEEKS = LONG_EVALUATION_WEEKS;
export const MARKET_REGIME_MIN_REFERENCE_COUNT = RECENT_EVALUATION_WEEKS;
export const MARKET_REGIME_TREND_QUANTILE = 0.5;
export const MARKET_REGIME_VOLATILITY_QUANTILE = 0.75;
export const MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT = 3;
export const MARKET_REGIME_LARGEST_ERROR_COUNT = 3;

export type MarketRegime = "stable" | "rising" | "falling" | "high-volatility" | "unclassified";

/** 표 순서는 성능과 무관하게 항상 고정한다. */
export const MARKET_REGIME_ORDER = ["stable", "rising", "falling", "high-volatility"] as const;

export interface MarketRegimeFeatures {
  trend4wRatio: number | null;
  volatility4wRatio: number | null;
  trendMagnitudeThreshold: number | null;
  highVolatilityThreshold: number | null;
}

export interface MarketRegimeTimelineEntry extends MarketRegimeFeatures {
  originWeekEndDate: Date;
  regime: MarketRegime;
}

export interface MarketRegimeMetrics {
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  rmseKrwPerL: number | null;
  medianAbsoluteErrorKrwPerL: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  directionAccuracyRatio: number | null;
}

export interface MarketRegimeSummary extends MarketRegimeMetrics {
  regime: MarketRegime;
  /** 오차 해석 참고용 집계이며 원인을 뜻하지 않는다. */
  averageTrendDeltaKrwPerL: number | null;
  averageDubaiContributionRatio: number | null;
  averageUsdKrwContributionRatio: number | null;
  averageExternalAdjustmentRatio: number | null;
  capReachedCount: number;
}

export interface MarketRegimeLargestError {
  originWeekEndDate: string;
  targetDate: string;
  regime: MarketRegime;
  forecastKrwPerL: number;
  actualKrwPerL: number;
  signedErrorKrwPerL: number;
  absoluteErrorKrwPerL: number;
  directionHit: boolean;
}

export interface MarketRegimeAnalysis {
  version: number;
  evaluatedAt: string;
  windowWeeks: number;
  currentRegime: MarketRegime;
  currentFeatures: MarketRegimeFeatures;
  currentWeekEndDate: string | null;
  overall: MarketRegimeMetrics;
  regimes: MarketRegimeSummary[];
  largestErrors: MarketRegimeLargestError[];
  weakestRegime: MarketRegime | null;
}

function roundRatio(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 1_000_000) / 1_000_000;
}

function roundMetric(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000;
}

function isUsablePrice(point: ForecastSeriesPoint | undefined): point is ForecastSeriesPoint {
  return point !== undefined && Number.isFinite(point.pointKrwPerL) && point.pointKrwPerL > 0;
}

function populationStandardDeviation(values: readonly number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

interface RegimeFeatureValues {
  trend4wRatio: number;
  volatility4wRatio: number;
}

function calculateFeatures(
  weeklySeries: readonly ForecastSeriesPoint[],
  index: number,
): RegimeFeatureValues | null {
  const start = index - MARKET_REGIME_TREND_LOOKBACK_WEEKS;

  if (start < 0) {
    return null;
  }

  const window = weeklySeries.slice(start, index + 1);

  if (window.length !== MARKET_REGIME_TREND_LOOKBACK_WEEKS + 1 || !window.every(isUsablePrice)) {
    return null;
  }

  const trend4wRatio = window[window.length - 1].pointKrwPerL / window[0].pointKrwPerL - 1;
  const weeklyRatios: number[] = [];

  for (let offset = 1; offset < window.length; offset += 1) {
    weeklyRatios.push(window[offset].pointKrwPerL / window[offset - 1].pointKrwPerL - 1);
  }

  const volatility4wRatio = populationStandardDeviation(weeklyRatios);

  if (!Number.isFinite(trend4wRatio) || !Number.isFinite(volatility4wRatio)) {
    return null;
  }

  return { trend4wRatio, volatility4wRatio };
}

function classify(
  features: RegimeFeatureValues,
  trendMagnitudeThreshold: number,
  highVolatilityThreshold: number,
): MarketRegime {
  // 완전히 평탄한 기준 구간에서는 threshold가 0이 되므로 변동이 있는 주차만 고변동으로 본다.
  if (features.volatility4wRatio > 0 && features.volatility4wRatio >= highVolatilityThreshold) {
    return "high-volatility";
  }

  if (features.trend4wRatio > trendMagnitudeThreshold) {
    return "rising";
  }

  return features.trend4wRatio < -trendMagnitudeThreshold ? "falling" : "stable";
}

/**
 * 각 origin 주차를 그 시점까지 확정된 국내 주간 경유 가격만으로 분류한다.
 * 현재 feature는 자신의 기준 계산에서 제외하므로 이후 주차가 추가되어도 과거 분류는 변하지 않는다.
 */
export function buildMarketRegimeTimeline(
  weeklySeries: readonly ForecastSeriesPoint[],
): MarketRegimeTimelineEntry[] {
  const timeline: MarketRegimeTimelineEntry[] = [];
  const priorFeatures: RegimeFeatureValues[] = [];

  for (let index = 0; index < weeklySeries.length; index += 1) {
    const features = calculateFeatures(weeklySeries, index);
    const reference = priorFeatures.slice(-MARKET_REGIME_REFERENCE_WINDOW_WEEKS);
    const hasReference = reference.length >= MARKET_REGIME_MIN_REFERENCE_COUNT;
    const trendMagnitudeThreshold = hasReference
      ? calculateQuantile(
          reference.map((entry) => Math.abs(entry.trend4wRatio)).sort((left, right) => left - right),
          MARKET_REGIME_TREND_QUANTILE,
        )
      : null;
    const highVolatilityThreshold = hasReference
      ? calculateQuantile(
          reference.map((entry) => entry.volatility4wRatio).sort((left, right) => left - right),
          MARKET_REGIME_VOLATILITY_QUANTILE,
        )
      : null;

    timeline.push({
      originWeekEndDate: weeklySeries[index].targetDate,
      trend4wRatio: features === null ? null : roundRatio(features.trend4wRatio),
      volatility4wRatio: features === null ? null : roundRatio(features.volatility4wRatio),
      trendMagnitudeThreshold: roundRatio(trendMagnitudeThreshold),
      highVolatilityThreshold: roundRatio(highVolatilityThreshold),
      regime:
        features === null || trendMagnitudeThreshold === null || highVolatilityThreshold === null
          ? "unclassified"
          : classify(features, trendMagnitudeThreshold, highVolatilityThreshold),
    });

    if (features !== null) {
      priorFeatures.push(features);
    }
  }

  return timeline;
}

function average(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : roundMetric(values.reduce((total, value) => total + value, 0) / values.length);
}

function summarizeRegime(
  regime: MarketRegime,
  points: readonly WalkForwardEvaluationPoint[],
  windowWeeks: number,
): MarketRegimeSummary {
  const metrics = summarizeWindow(points, windowWeeks, null);

  return {
    regime,
    sampleCount: metrics.sampleCount,
    maeKrwPerL: metrics.maeKrwPerL,
    mapePct: metrics.mapePct,
    rmseKrwPerL: metrics.rmseKrwPerL,
    medianAbsoluteErrorKrwPerL: metrics.medianAbsoluteErrorKrwPerL,
    maxAbsoluteErrorKrwPerL: metrics.maxAbsoluteErrorKrwPerL,
    directionAccuracyRatio: metrics.directionAccuracyRatio,
    averageTrendDeltaKrwPerL: average(points.map((point) => point.trendDeltaKrwPerL)),
    averageDubaiContributionRatio: average(
      points.flatMap((point) =>
        point.dubaiContributionRatio === null ? [] : [point.dubaiContributionRatio],
      ),
    ),
    averageUsdKrwContributionRatio: average(
      points.flatMap((point) =>
        point.usdKrwContributionRatio === null ? [] : [point.usdKrwContributionRatio],
      ),
    ),
    averageExternalAdjustmentRatio: average(points.map((point) => point.externalAdjustmentRatio)),
    capReachedCount: points.filter((point) => point.externalAdjustmentCapReached).length,
  };
}

export interface BuildMarketRegimeAnalysisInput {
  oneStepPoints: readonly WalkForwardEvaluationPoint[];
  weeklySeries: readonly ForecastSeriesPoint[];
  evaluatedAt: Date;
  windowWeeks?: number;
}

/**
 * 이미 기록된 one-step 평가 결과를 시장 상태별로 나눠 집계한다.
 * 추가 walk-forward를 실행하지 않으며 Forecast 결과에 개입하지 않는다.
 */
export function buildMarketRegimeAnalysis({
  oneStepPoints,
  weeklySeries,
  evaluatedAt,
  windowWeeks = LONG_EVALUATION_WEEKS,
}: BuildMarketRegimeAnalysisInput): MarketRegimeAnalysis {
  const timeline = buildMarketRegimeTimeline(weeklySeries);
  const regimeByOrigin = new Map<number, MarketRegime>(
    timeline.map((entry) => [entry.originWeekEndDate.getTime(), entry.regime]),
  );
  const windowPoints = oneStepPoints
    .filter((point) => point.horizonIndex === 1)
    .slice(-windowWeeks);
  const pointsByRegime: Record<MarketRegime, WalkForwardEvaluationPoint[]> = {
    stable: [],
    rising: [],
    falling: [],
    "high-volatility": [],
    unclassified: [],
  };

  for (const point of windowPoints) {
    pointsByRegime[
      regimeByOrigin.get(point.originWeekEndDate.getTime()) ?? "unclassified"
    ].push(point);
  }

  const regimes = MARKET_REGIME_ORDER.map((regime) =>
    summarizeRegime(regime, pointsByRegime[regime], windowWeeks),
  );
  const overallMetrics = summarizeWindow(windowPoints, windowWeeks, null);
  const largestErrors = [...windowPoints]
    .sort((left, right) => right.absoluteErrorKrwPerL - left.absoluteErrorKrwPerL)
    .slice(0, MARKET_REGIME_LARGEST_ERROR_COUNT)
    .map((point) => ({
      originWeekEndDate: point.originWeekEndDate.toISOString(),
      targetDate: point.targetDate.toISOString(),
      regime: regimeByOrigin.get(point.originWeekEndDate.getTime()) ?? "unclassified",
      forecastKrwPerL: point.forecastKrwPerL,
      actualKrwPerL: point.actualKrwPerL,
      signedErrorKrwPerL: roundMetric(point.forecastKrwPerL - point.actualKrwPerL) ?? 0,
      absoluteErrorKrwPerL: point.absoluteErrorKrwPerL,
      directionHit: point.actualDirection === point.forecastDirection,
    }));
  const weakest = regimes
    .filter(
      (summary) =>
        summary.sampleCount >= MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT && summary.maeKrwPerL !== null,
    )
    .reduce<MarketRegimeSummary | null>(
      (best, summary) =>
        best === null || (summary.maeKrwPerL ?? 0) > (best.maeKrwPerL ?? 0) ? summary : best,
      null,
    );
  const current = timeline[timeline.length - 1] ?? null;

  return {
    version: MARKET_REGIME_ANALYSIS_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    windowWeeks,
    currentRegime: current?.regime ?? "unclassified",
    currentFeatures: {
      trend4wRatio: current?.trend4wRatio ?? null,
      volatility4wRatio: current?.volatility4wRatio ?? null,
      trendMagnitudeThreshold: current?.trendMagnitudeThreshold ?? null,
      highVolatilityThreshold: current?.highVolatilityThreshold ?? null,
    },
    currentWeekEndDate: current?.originWeekEndDate.toISOString() ?? null,
    overall: {
      sampleCount: overallMetrics.sampleCount,
      maeKrwPerL: overallMetrics.maeKrwPerL,
      mapePct: overallMetrics.mapePct,
      rmseKrwPerL: overallMetrics.rmseKrwPerL,
      medianAbsoluteErrorKrwPerL: overallMetrics.medianAbsoluteErrorKrwPerL,
      maxAbsoluteErrorKrwPerL: overallMetrics.maxAbsoluteErrorKrwPerL,
      directionAccuracyRatio: overallMetrics.directionAccuracyRatio,
    },
    regimes,
    largestErrors,
    weakestRegime: weakest?.regime ?? null,
  };
}

const RegimeSchema = z.enum(["stable", "rising", "falling", "high-volatility", "unclassified"]);

const MetricsSchema = z.object({
  sampleCount: z.number(),
  maeKrwPerL: z.number().finite().nullable(),
  mapePct: z.number().finite().nullable(),
  rmseKrwPerL: z.number().finite().nullable(),
  medianAbsoluteErrorKrwPerL: z.number().finite().nullable(),
  maxAbsoluteErrorKrwPerL: z.number().finite().nullable(),
  directionAccuracyRatio: z.number().finite().nullable(),
});

const AnalysisMetadataSchema = z.object({
  model: z.object({
    marketRegimeAnalysis: z.object({
      version: z.number(),
      evaluatedAt: z.string().datetime(),
      windowWeeks: z.number(),
      currentRegime: RegimeSchema,
      currentFeatures: z.object({
        trend4wRatio: z.number().finite().nullable(),
        volatility4wRatio: z.number().finite().nullable(),
        trendMagnitudeThreshold: z.number().finite().nullable(),
        highVolatilityThreshold: z.number().finite().nullable(),
      }),
      currentWeekEndDate: z.string().datetime().nullable(),
      overall: MetricsSchema,
      regimes: z.array(
        MetricsSchema.extend({
          regime: RegimeSchema,
          averageTrendDeltaKrwPerL: z.number().finite().nullable(),
          averageDubaiContributionRatio: z.number().finite().nullable(),
          averageUsdKrwContributionRatio: z.number().finite().nullable(),
          averageExternalAdjustmentRatio: z.number().finite().nullable(),
          capReachedCount: z.number(),
        }),
      ),
      largestErrors: z.array(
        z.object({
          originWeekEndDate: z.string().datetime(),
          targetDate: z.string().datetime(),
          regime: RegimeSchema,
          forecastKrwPerL: z.number().finite(),
          actualKrwPerL: z.number().finite(),
          signedErrorKrwPerL: z.number().finite(),
          absoluteErrorKrwPerL: z.number().finite(),
          directionHit: z.boolean(),
        }),
      ),
      weakestRegime: RegimeSchema.nullable(),
    }),
  }),
});

export function readMarketRegimeAnalysis(metadata: unknown): MarketRegimeAnalysis | null {
  const parsed = AnalysisMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.marketRegimeAnalysis : null;
}
