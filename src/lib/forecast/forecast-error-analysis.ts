import { z } from "zod";

import { capExternalAdjustmentRatio, projectWeeklyPrice } from "./build-weekly-forecast";
import type { ForecastModelParams } from "./forecast-model-config";
import type { RunWalkForwardBacktestResult, WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

export const FORECAST_ERROR_ANALYSIS_VERSION = 1;
export const FORECAST_ERROR_ANALYSIS_STORED_LIMIT = 26;
export const FORECAST_ERROR_ANALYSIS_DISPLAY_LIMIT = 13;
const LARGEST_ERROR_COUNT = 3;

export type ForecastErrorFactorKey = "trend" | "dubai" | "usdKrw" | "cap";

export interface ForecastErrorFactor {
  /** 요소를 제거했을 때의 진단용 예측값. 미사용 요소는 null. */
  forecastKrwPerL: number | null;
  absoluteErrorKrwPerL: number | null;
  /** full 오차 - counterfactual 오차. 양수면 해당 요소가 오차를 키웠다. */
  errorImpactKrwPerL: number | null;
  applied: boolean;
}

export interface ForecastErrorModelComparison {
  modelId: string;
  forecastKrwPerL: number;
  absoluteErrorKrwPerL: number;
}

export interface ForecastErrorAnalysisPoint {
  targetDate: string;
  originWeekEndDate: string;
  actualKrwPerL: number;
  selectedForecastKrwPerL: number;
  selectedAbsoluteErrorKrwPerL: number;
  anchorKrwPerL: number;
  trendDeltaKrwPerL: number;
  dubaiContributionRatio: number | null;
  usdKrwContributionRatio: number | null;
  rawExternalAdjustmentRatio: number;
  externalAdjustmentRatio: number;
  externalAdjustmentCapReached: boolean;
  factors: Record<ForecastErrorFactorKey, ForecastErrorFactor>;
  modelComparisons: ForecastErrorModelComparison[];
}

export interface ForecastErrorAnalysis {
  version: number;
  selectedModelId: string;
  points: ForecastErrorAnalysisPoint[];
}

const FactorSchema = z.object({
  forecastKrwPerL: z.number().finite().nullable(),
  absoluteErrorKrwPerL: z.number().finite().nullable(),
  errorImpactKrwPerL: z.number().finite().nullable(),
  applied: z.boolean(),
});

const AnalysisPointSchema = z.object({
  targetDate: z.string().datetime(),
  originWeekEndDate: z.string().datetime(),
  actualKrwPerL: z.number().finite(),
  selectedForecastKrwPerL: z.number().finite(),
  selectedAbsoluteErrorKrwPerL: z.number().finite(),
  anchorKrwPerL: z.number().finite(),
  trendDeltaKrwPerL: z.number().finite(),
  dubaiContributionRatio: z.number().finite().nullable(),
  usdKrwContributionRatio: z.number().finite().nullable(),
  rawExternalAdjustmentRatio: z.number().finite(),
  externalAdjustmentRatio: z.number().finite(),
  externalAdjustmentCapReached: z.boolean(),
  factors: z.object({
    trend: FactorSchema,
    dubai: FactorSchema,
    usdKrw: FactorSchema,
    cap: FactorSchema,
  }),
  modelComparisons: z.array(
    z.object({
      modelId: z.string(),
      forecastKrwPerL: z.number().finite(),
      absoluteErrorKrwPerL: z.number().finite(),
    }),
  ),
});

const AnalysisMetadataSchema = z.object({
  model: z.object({
    errorAnalysis: z.object({
      version: z.number(),
      selectedModelId: z.string(),
      points: z.array(AnalysisPointSchema),
    }),
  }),
});

function buildFactor(
  applied: boolean,
  counterfactualForecast: number | null,
  actualKrwPerL: number,
  fullAbsoluteError: number,
): ForecastErrorFactor {
  if (!applied || counterfactualForecast === null) {
    return { forecastKrwPerL: null, absoluteErrorKrwPerL: null, errorImpactKrwPerL: null, applied };
  }

  const absoluteErrorKrwPerL = Math.abs(counterfactualForecast - actualKrwPerL);

  return {
    forecastKrwPerL: counterfactualForecast,
    absoluteErrorKrwPerL,
    errorImpactKrwPerL: fullAbsoluteError - absoluteErrorKrwPerL,
    applied,
  };
}

/**
 * one-step 평가 시점에 이미 기록된 구성요소만 사용해 counterfactual 예측을 만든다.
 * 미래 데이터를 다시 읽지 않으므로 leakage가 발생하지 않는다.
 */
export function buildForecastErrorAnalysisPoint(
  point: WalkForwardEvaluationPoint,
  params: ForecastModelParams,
  modelComparisons: readonly ForecastErrorModelComparison[] = [],
): ForecastErrorAnalysisPoint {
  const cap = Math.abs(params.externalAdjustmentCapRatio);
  const dubaiRatio = point.dubaiContributionRatio;
  const usdKrwRatio = point.usdKrwContributionRatio;
  const fullError = point.absoluteErrorKrwPerL;
  const noTrendForecast = projectWeeklyPrice(point.anchorKrwPerL, 0, 1, point.externalAdjustmentRatio);
  const noDubaiForecast =
    dubaiRatio === null
      ? null
      : projectWeeklyPrice(
          point.anchorKrwPerL,
          point.trendDeltaKrwPerL,
          1,
          capExternalAdjustmentRatio(usdKrwRatio ?? 0, cap),
        );
  const noUsdKrwForecast =
    usdKrwRatio === null
      ? null
      : projectWeeklyPrice(
          point.anchorKrwPerL,
          point.trendDeltaKrwPerL,
          1,
          capExternalAdjustmentRatio(dubaiRatio ?? 0, cap),
        );
  const noCapForecast = point.externalAdjustmentCapReached
    ? projectWeeklyPrice(
        point.anchorKrwPerL,
        point.trendDeltaKrwPerL,
        1,
        point.rawExternalAdjustmentRatio,
      )
    : null;

  return {
    targetDate: point.targetDate.toISOString(),
    originWeekEndDate: point.originWeekEndDate.toISOString(),
    actualKrwPerL: point.actualKrwPerL,
    selectedForecastKrwPerL: point.forecastKrwPerL,
    selectedAbsoluteErrorKrwPerL: fullError,
    anchorKrwPerL: point.anchorKrwPerL,
    trendDeltaKrwPerL: point.trendDeltaKrwPerL,
    dubaiContributionRatio: dubaiRatio,
    usdKrwContributionRatio: usdKrwRatio,
    rawExternalAdjustmentRatio: point.rawExternalAdjustmentRatio,
    externalAdjustmentRatio: point.externalAdjustmentRatio,
    externalAdjustmentCapReached: point.externalAdjustmentCapReached,
    factors: {
      trend: buildFactor(point.trendDeltaKrwPerL !== 0, noTrendForecast, point.actualKrwPerL, fullError),
      dubai: buildFactor(dubaiRatio !== null, noDubaiForecast, point.actualKrwPerL, fullError),
      usdKrw: buildFactor(usdKrwRatio !== null, noUsdKrwForecast, point.actualKrwPerL, fullError),
      cap: buildFactor(point.externalAdjustmentCapReached, noCapForecast, point.actualKrwPerL, fullError),
    },
    modelComparisons: [...modelComparisons],
  };
}

export interface BuildForecastErrorAnalysisInput {
  selectedModelId: string;
  selectedParams: ForecastModelParams;
  selectedBacktest: Pick<RunWalkForwardBacktestResult, "oneStepPoints">;
  candidateBacktestsByModelId: Readonly<
    Record<string, Pick<RunWalkForwardBacktestResult, "oneStepPoints"> | null>
  >;
  limit?: number;
}

export function buildForecastErrorAnalysis({
  selectedModelId,
  selectedParams,
  selectedBacktest,
  candidateBacktestsByModelId,
  limit = FORECAST_ERROR_ANALYSIS_STORED_LIMIT,
}: BuildForecastErrorAnalysisInput): ForecastErrorAnalysis {
  const forecastByModelAndTarget = new Map<string, Map<number, WalkForwardEvaluationPoint>>();

  for (const [modelId, backtest] of Object.entries(candidateBacktestsByModelId)) {
    if (backtest === null) {
      continue;
    }

    forecastByModelAndTarget.set(
      modelId,
      new Map(backtest.oneStepPoints.map((point) => [point.targetDate.getTime(), point])),
    );
  }

  const points = selectedBacktest.oneStepPoints.slice(-limit).map((point) => {
    const comparisons: ForecastErrorModelComparison[] = [];

    for (const [modelId, byTarget] of [...forecastByModelAndTarget.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const candidatePoint = byTarget.get(point.targetDate.getTime());

      if (candidatePoint === undefined) {
        continue;
      }

      comparisons.push({
        modelId,
        forecastKrwPerL: candidatePoint.forecastKrwPerL,
        absoluteErrorKrwPerL: candidatePoint.absoluteErrorKrwPerL,
      });
    }

    return buildForecastErrorAnalysisPoint(point, selectedParams, comparisons);
  });

  return { version: FORECAST_ERROR_ANALYSIS_VERSION, selectedModelId, points };
}

export function readForecastErrorAnalysis(metadata: unknown): ForecastErrorAnalysis | null {
  const parsed = AnalysisMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.errorAnalysis : null;
}

export interface ForecastFactorSummary {
  key: ForecastErrorFactorKey;
  appliedWeekCount: number;
  reducedWeekCount: number;
  increasedWeekCount: number;
  neutralWeekCount: number;
  averageErrorImpactKrwPerL: number | null;
}

export interface ForecastErrorAnalysisSummary {
  selectedModelId: string;
  points: ForecastErrorAnalysisPoint[];
  factors: ForecastFactorSummary[];
  largestErrorPoints: ForecastErrorAnalysisPoint[];
  modelSummaries: ForecastModelErrorSummary[];
}

export interface ForecastModelErrorSummary {
  modelId: string;
  sampleCount: number;
  maeKrwPerL: number;
  mapePct: number | null;
  bestWeekCount: number;
  isSelected: boolean;
}

const FACTOR_KEYS: readonly ForecastErrorFactorKey[] = ["trend", "dubai", "usdKrw", "cap"];

export function summarizeForecastErrorAnalysis(
  analysis: ForecastErrorAnalysis,
  limit = FORECAST_ERROR_ANALYSIS_DISPLAY_LIMIT,
): ForecastErrorAnalysisSummary {
  const points = [...analysis.points]
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate))
    .slice(-limit);
  const factors = FACTOR_KEYS.map((key) => {
    const applied = points.flatMap((point) =>
      point.factors[key].applied && point.factors[key].errorImpactKrwPerL !== null
        ? [point.factors[key].errorImpactKrwPerL]
        : [],
    );

    return {
      key,
      appliedWeekCount: applied.length,
      reducedWeekCount: applied.filter((impact) => impact < 0).length,
      increasedWeekCount: applied.filter((impact) => impact > 0).length,
      neutralWeekCount: applied.filter((impact) => impact === 0).length,
      averageErrorImpactKrwPerL:
        applied.length === 0 ? null : applied.reduce((sum, impact) => sum + impact, 0) / applied.length,
    };
  });
  const modelIds = [...new Set(points.flatMap((point) => point.modelComparisons.map((row) => row.modelId)))].sort();
  const modelSummaries = modelIds.map((modelId) => {
    const rows = points.flatMap((point) => {
      const comparison = point.modelComparisons.find((row) => row.modelId === modelId);
      return comparison === undefined ? [] : [{ point, comparison }];
    });
    const percentageErrors = rows.flatMap(({ point, comparison }) =>
      point.actualKrwPerL === 0
        ? []
        : [(comparison.absoluteErrorKrwPerL / point.actualKrwPerL) * 100],
    );

    return {
      modelId,
      sampleCount: rows.length,
      maeKrwPerL:
        rows.length === 0
          ? 0
          : rows.reduce((sum, { comparison }) => sum + comparison.absoluteErrorKrwPerL, 0) / rows.length,
      mapePct:
        percentageErrors.length === 0
          ? null
          : percentageErrors.reduce((sum, value) => sum + value, 0) / percentageErrors.length,
      bestWeekCount: points.filter((point) => {
        const best = [...point.modelComparisons].sort(
          (left, right) => left.absoluteErrorKrwPerL - right.absoluteErrorKrwPerL,
        )[0];
        return best !== undefined && best.modelId === modelId;
      }).length,
      isSelected: modelId === analysis.selectedModelId,
    };
  });

  return {
    selectedModelId: analysis.selectedModelId,
    points,
    factors,
    largestErrorPoints: [...points]
      .sort((left, right) => right.selectedAbsoluteErrorKrwPerL - left.selectedAbsoluteErrorKrwPerL)
      .slice(0, LARGEST_ERROR_COUNT),
    modelSummaries,
  };
}
