import { type ForecastHorizonKind } from "@prisma/client";

import type {
  BuildBaselineForecastInput,
  BuildBaselineForecastResult,
  ForecastProjectionPoint,
  ForecastSeriesPoint,
} from "./types";

const DEFAULT_LOOKBACK_COUNT: Record<ForecastHorizonKind, number> = {
  weekly: 8,
  monthly: 3,
};

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonthsToMonthEnd(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months + 1, 0));
}

function getNextTargetDate(
  horizonKind: ForecastHorizonKind,
  lastTargetDate: Date,
  horizonIndex: number,
): Date {
  if (horizonKind === "weekly") {
    return addUtcDays(lastTargetDate, horizonIndex * 7);
  }

  return addUtcMonthsToMonthEnd(lastTargetDate, horizonIndex);
}

function resolveLookbackCount(
  horizonKind: ForecastHorizonKind,
  historyCount: number,
  requestedLookbackCount?: number,
): number {
  const configured = requestedLookbackCount ?? DEFAULT_LOOKBACK_COUNT[horizonKind];
  return Math.max(1, Math.min(historyCount, configured));
}

function calculateMeanDelta(points: readonly ForecastSeriesPoint[]): number {
  if (points.length <= 1) {
    return 0;
  }

  let deltaTotal = 0;

  for (let index = 1; index < points.length; index += 1) {
    deltaTotal += points[index].pointKrwPerL - points[index - 1].pointKrwPerL;
  }

  return deltaTotal / (points.length - 1);
}

function calculateResidualMeanAbsoluteError(
  points: readonly ForecastSeriesPoint[],
  baselineLevelKrwPerL: number,
): number {
  if (points.length === 0) {
    return 0;
  }

  let absoluteErrorTotal = 0;

  for (const point of points) {
    absoluteErrorTotal += Math.abs(point.pointKrwPerL - baselineLevelKrwPerL);
  }

  return absoluteErrorTotal / points.length;
}

function buildProjection(
  horizonKind: ForecastHorizonKind,
  lastTargetDate: Date,
  baselineLevelKrwPerL: number,
  meanDeltaKrwPerL: number,
  residualMeanAbsoluteErrorKrwPerL: number,
  horizonIndex: number,
): ForecastProjectionPoint {
  const pointKrwPerL = roundPrice(
    clampNonNegative(baselineLevelKrwPerL + meanDeltaKrwPerL * horizonIndex),
  );
  const confidenceWidth = roundPrice(
    residualMeanAbsoluteErrorKrwPerL * Math.sqrt(horizonIndex || 1),
  );

  return {
    horizonKind,
    horizonIndex,
    targetDate: getNextTargetDate(horizonKind, lastTargetDate, horizonIndex),
    pointKrwPerL,
    lowerBoundKrwPerL: roundPrice(clampNonNegative(pointKrwPerL - confidenceWidth)),
    upperBoundKrwPerL: roundPrice(pointKrwPerL + confidenceWidth),
  };
}

export function buildBaselineForecast(
  input: BuildBaselineForecastInput,
): BuildBaselineForecastResult {
  if (input.historicalPoints.length === 0) {
    throw new Error("Baseline forecast requires at least one aggregated history point.");
  }

  if (input.horizonCount <= 0) {
    throw new Error("Baseline forecast horizonCount must be greater than zero.");
  }

  const lookbackCount = resolveLookbackCount(
    input.horizonKind,
    input.historicalPoints.length,
    input.lookbackCount,
  );
  const lookbackPoints = input.historicalPoints.slice(-lookbackCount);
  const baselineLevelKrwPerL =
    lookbackPoints.reduce((sum, point) => sum + point.pointKrwPerL, 0) / lookbackPoints.length;
  const meanDeltaKrwPerL = calculateMeanDelta(lookbackPoints);
  const residualMeanAbsoluteErrorKrwPerL = calculateResidualMeanAbsoluteError(
    lookbackPoints,
    baselineLevelKrwPerL,
  );
  const lastTargetDate = input.historicalPoints[input.historicalPoints.length - 1].targetDate;
  const projections: ForecastProjectionPoint[] = [];

  for (let horizonIndex = 1; horizonIndex <= input.horizonCount; horizonIndex += 1) {
    projections.push(
      buildProjection(
        input.horizonKind,
        lastTargetDate,
        baselineLevelKrwPerL,
        meanDeltaKrwPerL,
        residualMeanAbsoluteErrorKrwPerL,
        horizonIndex,
      ),
    );
  }

  return {
    horizonKind: input.horizonKind,
    horizonCount: input.horizonCount,
    diagnostics: {
      historyCount: input.historicalPoints.length,
      lookbackCount,
      baselineLevelKrwPerL: roundPrice(baselineLevelKrwPerL),
      meanDeltaKrwPerL: roundPrice(meanDeltaKrwPerL),
      residualMeanAbsoluteErrorKrwPerL: roundPrice(residualMeanAbsoluteErrorKrwPerL),
    },
    projections,
  };
}
