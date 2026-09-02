import {
  buildWeeklyForecast,
  type ForecastIndicatorWeeklySeries,
} from "./build-weekly-forecast";
import {
  LONG_EVALUATION_WEEKS,
  RECENT_EVALUATION_WEEKS,
  RESIDUAL_QUANTILE_LEVELS,
  WEEKLY_TREND_MIN_ACTUAL_COUNT,
  type ForecastModelParams,
} from "./forecast-model-config";
import type { ForecastSeriesPoint } from "./types";

export type ForecastDirection = "up" | "down" | "flat";

export interface WalkForwardEvaluationPoint {
  originWeekEndDate: Date;
  targetDate: Date;
  horizonIndex: number;
  anchorKrwPerL: number;
  actualKrwPerL: number;
  forecastKrwPerL: number;
  absoluteErrorKrwPerL: number;
  absolutePercentageErrorPct: number | null;
  actualDirection: ForecastDirection;
  forecastDirection: ForecastDirection;
  /** 진단 전용 구성요소. 예측값 계산에는 이미 반영되어 있다. */
  trendDeltaKrwPerL: number;
  dubaiContributionRatio: number | null;
  usdKrwContributionRatio: number | null;
  rawExternalAdjustmentRatio: number;
  externalAdjustmentRatio: number;
  externalAdjustmentCapReached: boolean;
}

export interface WalkForwardWindowMetrics {
  windowWeeks: number;
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  rmseKrwPerL: number | null;
  medianAbsoluteErrorKrwPerL: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  directionAccuracyRatio: number | null;
  forecastChurnKrwPerL: number | null;
}

export interface WalkForwardHorizonMetrics {
  horizonIndex: number;
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  rmseKrwPerL: number | null;
  absoluteErrorQuantilesKrwPerL: Record<string, number>;
}

export interface RunWalkForwardBacktestInput {
  weeklySeries: readonly ForecastSeriesPoint[];
  indicatorSeries: ForecastIndicatorWeeklySeries;
  params: ForecastModelParams;
  horizonCount: number;
  recentWindowWeeks?: number;
  longWindowWeeks?: number;
}

export interface RunWalkForwardBacktestResult {
  params: ForecastModelParams;
  recent: WalkForwardWindowMetrics;
  long: WalkForwardWindowMetrics;
  recentOneStep: WalkForwardWindowMetrics;
  longOneStep: WalkForwardWindowMetrics;
  horizons: WalkForwardHorizonMetrics[];
  absoluteErrorByHorizon: Map<number, number>;
  oneStepPoints: WalkForwardEvaluationPoint[];
}

function roundMetric(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

export function resolveForecastDirection(anchor: number, value: number): ForecastDirection {
  if (value > anchor) {
    return "up";
  }

  return value < anchor ? "down" : "flat";
}

export function calculateQuantile(sortedValues: readonly number[], level: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * Math.min(1, Math.max(0, level));
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;

  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function summarizeWindow(
  points: readonly WalkForwardEvaluationPoint[],
  windowWeeks: number,
  churnKrwPerL: number | null,
): WalkForwardWindowMetrics {
  if (points.length === 0) {
    return {
      windowWeeks,
      sampleCount: 0,
      maeKrwPerL: null,
      mapePct: null,
      rmseKrwPerL: null,
      medianAbsoluteErrorKrwPerL: null,
      maxAbsoluteErrorKrwPerL: null,
      directionAccuracyRatio: null,
      forecastChurnKrwPerL: roundMetric(churnKrwPerL),
    };
  }

  let absoluteErrorTotal = 0;
  let squaredErrorTotal = 0;
  let percentageErrorTotal = 0;
  let percentageSampleCount = 0;
  let directionMatchCount = 0;
  let maxAbsoluteError = 0;
  const absoluteErrors: number[] = [];

  for (const point of points) {
    absoluteErrorTotal += point.absoluteErrorKrwPerL;
    squaredErrorTotal += point.absoluteErrorKrwPerL ** 2;
    absoluteErrors.push(point.absoluteErrorKrwPerL);

    if (point.absoluteErrorKrwPerL > maxAbsoluteError) {
      maxAbsoluteError = point.absoluteErrorKrwPerL;
    }

    if (point.absolutePercentageErrorPct !== null) {
      percentageErrorTotal += point.absolutePercentageErrorPct;
      percentageSampleCount += 1;
    }

    if (point.actualDirection === point.forecastDirection) {
      directionMatchCount += 1;
    }
  }

  absoluteErrors.sort((left, right) => left - right);

  return {
    windowWeeks,
    sampleCount: points.length,
    maeKrwPerL: roundMetric(absoluteErrorTotal / points.length),
    mapePct: percentageSampleCount === 0 ? null : roundMetric(percentageErrorTotal / percentageSampleCount),
    rmseKrwPerL: roundMetric(Math.sqrt(squaredErrorTotal / points.length)),
    medianAbsoluteErrorKrwPerL: roundMetric(calculateQuantile(absoluteErrors, 0.5)),
    maxAbsoluteErrorKrwPerL: roundMetric(maxAbsoluteError),
    directionAccuracyRatio: roundMetric(directionMatchCount / points.length),
    forecastChurnKrwPerL: roundMetric(churnKrwPerL),
  };
}

function summarizeHorizons(
  points: readonly WalkForwardEvaluationPoint[],
  horizonCount: number,
): WalkForwardHorizonMetrics[] {
  const metrics: WalkForwardHorizonMetrics[] = [];

  for (let horizonIndex = 1; horizonIndex <= horizonCount; horizonIndex += 1) {
    const horizonPoints = points.filter((point) => point.horizonIndex === horizonIndex);
    const absoluteErrors = horizonPoints
      .map((point) => point.absoluteErrorKrwPerL)
      .sort((left, right) => left - right);
    const quantiles: Record<string, number> = {};

    for (const level of RESIDUAL_QUANTILE_LEVELS) {
      const quantile = calculateQuantile(absoluteErrors, level);

      if (quantile !== null) {
        quantiles[`p${Math.round(level * 100)}`] = roundMetric(quantile) ?? 0;
      }
    }

    if (horizonPoints.length === 0) {
      metrics.push({
        horizonIndex,
        sampleCount: 0,
        maeKrwPerL: null,
        mapePct: null,
        rmseKrwPerL: null,
        absoluteErrorQuantilesKrwPerL: quantiles,
      });
      continue;
    }

    let absoluteErrorTotal = 0;
    let squaredErrorTotal = 0;
    let percentageErrorTotal = 0;
    let percentageSampleCount = 0;

    for (const point of horizonPoints) {
      absoluteErrorTotal += point.absoluteErrorKrwPerL;
      squaredErrorTotal += point.absoluteErrorKrwPerL ** 2;

      if (point.absolutePercentageErrorPct !== null) {
        percentageErrorTotal += point.absolutePercentageErrorPct;
        percentageSampleCount += 1;
      }
    }

    metrics.push({
      horizonIndex,
      sampleCount: horizonPoints.length,
      maeKrwPerL: roundMetric(absoluteErrorTotal / horizonPoints.length),
      mapePct:
        percentageSampleCount === 0 ? null : roundMetric(percentageErrorTotal / percentageSampleCount),
      rmseKrwPerL: roundMetric(Math.sqrt(squaredErrorTotal / horizonPoints.length)),
      absoluteErrorQuantilesKrwPerL: quantiles,
    });
  }

  return metrics;
}

export function runWalkForwardBacktest(
  input: RunWalkForwardBacktestInput,
): RunWalkForwardBacktestResult {
  const recentWindowWeeks = input.recentWindowWeeks ?? RECENT_EVALUATION_WEEKS;
  const longWindowWeeks = input.longWindowWeeks ?? LONG_EVALUATION_WEEKS;
  const series = input.weeklySeries;
  const evaluationPoints: WalkForwardEvaluationPoint[] = [];
  const oneStepForecastByOrigin: Array<{ originIndex: number; forecastKrwPerL: number }> = [];

  for (let originIndex = WEEKLY_TREND_MIN_ACTUAL_COUNT - 1; originIndex < series.length - 1; originIndex += 1) {
    const history = series.slice(0, originIndex + 1);
    const remainingHorizons = Math.min(input.horizonCount, series.length - 1 - originIndex);
    const forecast = buildWeeklyForecast({
      weeklySeries: history,
      indicatorSeries: input.indicatorSeries,
      params: input.params,
      horizonCount: remainingHorizons,
    });

    if (forecast.status !== "ready" || forecast.anchorPriceKrwPerL === null) {
      continue;
    }

    for (const point of forecast.points) {
      const actual = series[originIndex + point.horizonIndex];
      const absoluteErrorKrwPerL = Math.abs(actual.pointKrwPerL - point.pointKrwPerL);

      evaluationPoints.push({
        originWeekEndDate: history[history.length - 1].targetDate,
        targetDate: actual.targetDate,
        horizonIndex: point.horizonIndex,
        anchorKrwPerL: forecast.anchorPriceKrwPerL,
        actualKrwPerL: actual.pointKrwPerL,
        forecastKrwPerL: point.pointKrwPerL,
        absoluteErrorKrwPerL,
        absolutePercentageErrorPct:
          actual.pointKrwPerL === 0 ? null : (absoluteErrorKrwPerL / actual.pointKrwPerL) * 100,
        actualDirection: resolveForecastDirection(forecast.anchorPriceKrwPerL, actual.pointKrwPerL),
        forecastDirection: resolveForecastDirection(forecast.anchorPriceKrwPerL, point.pointKrwPerL),
        trendDeltaKrwPerL: forecast.trendDeltaKrwPerL ?? 0,
        dubaiContributionRatio: forecast.dubai?.contributionRatio ?? null,
        usdKrwContributionRatio: forecast.usdKrw?.contributionRatio ?? null,
        rawExternalAdjustmentRatio:
          (forecast.dubai?.contributionRatio ?? 0) + (forecast.usdKrw?.contributionRatio ?? 0),
        externalAdjustmentRatio: forecast.externalAdjustmentRatio,
        externalAdjustmentCapReached: forecast.externalAdjustmentCapReached,
      });

      if (point.horizonIndex === 1) {
        oneStepForecastByOrigin.push({ originIndex, forecastKrwPerL: point.pointKrwPerL });
      }
    }
  }

  const recentTargetThresholdIndex = series.length - recentWindowWeeks;
  const longTargetThresholdIndex = series.length - longWindowWeeks;
  const recentThresholdDate = series[Math.max(0, recentTargetThresholdIndex)]?.targetDate ?? null;
  const longThresholdDate = series[Math.max(0, longTargetThresholdIndex)]?.targetDate ?? null;
  const recentPoints = evaluationPoints.filter(
    (point) => recentThresholdDate === null || point.targetDate.getTime() >= recentThresholdDate.getTime(),
  );
  const longPoints = evaluationPoints.filter(
    (point) => longThresholdDate === null || point.targetDate.getTime() >= longThresholdDate.getTime(),
  );
  const recentChurnSamples: number[] = [];

  for (let index = 1; index < oneStepForecastByOrigin.length; index += 1) {
    const current = oneStepForecastByOrigin[index];
    const previous = oneStepForecastByOrigin[index - 1];

    if (current.originIndex >= Math.max(0, recentTargetThresholdIndex)) {
      recentChurnSamples.push(Math.abs(current.forecastKrwPerL - previous.forecastKrwPerL));
    }
  }

  const recentChurn =
    recentChurnSamples.length === 0
      ? null
      : recentChurnSamples.reduce((sum, value) => sum + value, 0) / recentChurnSamples.length;
  const horizons = summarizeHorizons(longPoints, input.horizonCount);
  const absoluteErrorByHorizon = new Map<number, number>();

  for (const horizon of horizons) {
    const quantile = horizon.absoluteErrorQuantilesKrwPerL.p90;

    if (typeof quantile === "number" && horizon.sampleCount > 0) {
      absoluteErrorByHorizon.set(horizon.horizonIndex, quantile);
    }
  }

  const oneStepRecentPoints = recentPoints.filter((point) => point.horizonIndex === 1);
  const oneStepLongPoints = longPoints.filter((point) => point.horizonIndex === 1);

  return {
    params: input.params,
    recent: summarizeWindow(recentPoints, recentWindowWeeks, recentChurn),
    long: summarizeWindow(longPoints, longWindowWeeks, recentChurn),
    recentOneStep: summarizeWindow(oneStepRecentPoints, recentWindowWeeks, recentChurn),
    longOneStep: summarizeWindow(oneStepLongPoints, longWindowWeeks, recentChurn),
    horizons,
    absoluteErrorByHorizon,
    oneStepPoints: evaluationPoints
      .filter((point) => point.horizonIndex === 1)
      .sort((left, right) => left.targetDate.getTime() - right.targetDate.getTime()),
  };
}
