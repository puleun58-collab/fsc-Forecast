import { ForecastHorizonKind } from "@prisma/client";

import {
  WEEKLY_TREND_MIN_ACTUAL_COUNT,
  type ForecastIndicatorParams,
  type ForecastModelParams,
} from "./forecast-model-config";
import type { ForecastProjectionPoint, ForecastSeriesPoint } from "./types";

const WEEK_MS = 604_800_000;

export interface ForecastIndicatorWeeklyPoint {
  weekEndDate: Date;
  value: number;
  observedAt: Date;
}

export interface ForecastIndicatorWeeklySeries {
  dubai: readonly ForecastIndicatorWeeklyPoint[];
  usdKrw: readonly ForecastIndicatorWeeklyPoint[];
}

export interface ForecastIndicatorContribution {
  indicatorCode: "dubai" | "usd-krw";
  lagWeeks: number;
  weight: number;
  basisWeekEndDate: Date | null;
  basisValue: number | null;
  previousWeekEndDate: Date | null;
  previousValue: number | null;
  changeRatio: number | null;
  contributionRatio: number;
}

export interface BuildWeeklyForecastInput {
  weeklySeries: readonly ForecastSeriesPoint[];
  indicatorSeries: ForecastIndicatorWeeklySeries;
  params: ForecastModelParams;
  horizonCount: number;
  absoluteErrorByHorizon?: ReadonlyMap<number, number>;
}

export interface BuildWeeklyForecastResult {
  status: "ready" | "pending";
  pendingReason: string | null;
  anchorWeekEndDate: Date | null;
  anchorPriceKrwPerL: number | null;
  trendDeltaKrwPerL: number | null;
  trendLookbackCount: number;
  dubai: ForecastIndicatorContribution | null;
  usdKrw: ForecastIndicatorContribution | null;
  externalAdjustmentRatio: number;
  externalAdjustmentCapReached: boolean;
  points: ForecastProjectionPoint[];
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function calculateWeeklyTrendDelta(points: readonly ForecastSeriesPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }

  let deltaTotal = 0;

  for (let index = 1; index < points.length; index += 1) {
    deltaTotal += points[index].pointKrwPerL - points[index - 1].pointKrwPerL;
  }

  return deltaTotal / (points.length - 1);
}

function resolveIndicatorContribution(
  indicatorCode: "dubai" | "usd-krw",
  series: readonly ForecastIndicatorWeeklyPoint[],
  params: ForecastIndicatorParams,
  anchorWeekEndDate: Date,
): ForecastIndicatorContribution {
  const available = series.filter((point) => point.weekEndDate.getTime() <= anchorWeekEndDate.getTime());
  const basisIndex = available.length - params.lagWeeks;
  const basis = basisIndex >= 0 ? available[basisIndex] ?? null : null;
  const previous = basisIndex >= 1 ? available[basisIndex - 1] ?? null : null;
  const changeRatio =
    basis === null || previous === null || previous.value === 0
      ? null
      : (basis.value - previous.value) / previous.value;

  return {
    indicatorCode,
    lagWeeks: params.lagWeeks,
    weight: params.weight,
    basisWeekEndDate: basis?.weekEndDate ?? null,
    basisValue: basis?.value ?? null,
    previousWeekEndDate: previous?.weekEndDate ?? null,
    previousValue: previous?.value ?? null,
    changeRatio,
    contributionRatio: changeRatio === null ? 0 : changeRatio * params.weight,
  };
}

export function buildWeeklyForecast(input: BuildWeeklyForecastInput): BuildWeeklyForecastResult {
  if (input.horizonCount <= 0) {
    throw new Error("Weekly forecast horizonCount must be greater than zero.");
  }

  const pending: BuildWeeklyForecastResult = {
    status: "pending",
    pendingReason: null,
    anchorWeekEndDate: null,
    anchorPriceKrwPerL: null,
    trendDeltaKrwPerL: null,
    trendLookbackCount: 0,
    dubai: null,
    usdKrw: null,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
    points: [],
  };

  if (input.weeklySeries.length < WEEKLY_TREND_MIN_ACTUAL_COUNT) {
    return {
      ...pending,
      pendingReason: `insufficient_weekly_actuals:${input.weeklySeries.length}`,
    };
  }

  const anchor = input.weeklySeries[input.weeklySeries.length - 1];
  const lookbackCount = Math.min(input.params.trendLookbackWeeks, input.weeklySeries.length);
  const lookbackPoints = input.weeklySeries.slice(-lookbackCount);
  const trendDeltaKrwPerL = calculateWeeklyTrendDelta(lookbackPoints);

  if (trendDeltaKrwPerL === null) {
    return {
      ...pending,
      anchorWeekEndDate: anchor.targetDate,
      anchorPriceKrwPerL: anchor.pointKrwPerL,
      trendLookbackCount: lookbackPoints.length,
      pendingReason: "weekly_trend_unavailable",
    };
  }

  const dubai =
    input.params.dubai === null
      ? null
      : resolveIndicatorContribution("dubai", input.indicatorSeries.dubai, input.params.dubai, anchor.targetDate);
  const usdKrw =
    input.params.usdKrw === null
      ? null
      : resolveIndicatorContribution("usd-krw", input.indicatorSeries.usdKrw, input.params.usdKrw, anchor.targetDate);
  const rawAdjustmentRatio = (dubai?.contributionRatio ?? 0) + (usdKrw?.contributionRatio ?? 0);
  const cap = Math.abs(input.params.externalAdjustmentCapRatio);
  const externalAdjustmentRatio = Math.min(cap, Math.max(-cap, rawAdjustmentRatio));
  const points: ForecastProjectionPoint[] = [];

  for (let horizonIndex = 1; horizonIndex <= input.horizonCount; horizonIndex += 1) {
    const baseForecast = anchor.pointKrwPerL + trendDeltaKrwPerL * horizonIndex;
    const pointKrwPerL = roundPrice(Math.max(0, baseForecast * (1 + externalAdjustmentRatio)));
    const absoluteError = input.absoluteErrorByHorizon?.get(horizonIndex) ?? null;

    points.push({
      horizonKind: ForecastHorizonKind.weekly,
      horizonIndex,
      targetDate: new Date(anchor.targetDate.getTime() + WEEK_MS * horizonIndex),
      pointKrwPerL,
      lowerBoundKrwPerL:
        absoluteError === null ? null : roundPrice(Math.max(0, pointKrwPerL - absoluteError)),
      upperBoundKrwPerL: absoluteError === null ? null : roundPrice(pointKrwPerL + absoluteError),
    });
  }

  return {
    status: "ready",
    pendingReason: null,
    anchorWeekEndDate: anchor.targetDate,
    anchorPriceKrwPerL: roundPrice(anchor.pointKrwPerL),
    trendDeltaKrwPerL: roundPrice(trendDeltaKrwPerL),
    trendLookbackCount: lookbackPoints.length,
    dubai,
    usdKrw,
    externalAdjustmentRatio,
    externalAdjustmentCapReached: Math.abs(rawAdjustmentRatio) > cap,
    points,
  };
}
