import { z } from "zod";

import {
  DUBAI_LAG_WEEK_CANDIDATES,
  DUBAI_WEIGHT_CANDIDATES,
  EXTERNAL_ADJUSTMENT_CAP_CANDIDATES,
  PROMOTION_MIN_SAMPLE_COUNT,
  USD_KRW_LAG_WEEK_CANDIDATES,
  USD_KRW_WEIGHT_CANDIDATES,
  type ForecastModelParams,
} from "./forecast-model-config";
import { evaluatePromotionQuality, type PromotionQualityChecks } from "./promotion-quality";
import type { RunWalkForwardBacktestResult } from "./run-walk-forward-backtest";

/** 진단 전용 Trend 후보. 운영 candidate 탐색 범위에는 연결하지 않는다. */
export const DIAGNOSTIC_TREND_LOOKBACK_CANDIDATES = [4, 6, 8, 10, 12] as const;
export const PARAMETER_SENSITIVITY_VERSION = 1;
export const TUNING_CANDIDATE_LIMIT = 3;

export type ParameterSensitivityGroupKey = "trendLookback" | "dubai" | "usdKrw" | "cap";

export interface SensitivityWindowMetrics {
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  directionAccuracyRatio: number | null;
  forecastChurnKrwPerL: number | null;
}

export interface SensitivityCandidate {
  label: string;
  params: ForecastModelParams;
  isCurrent: boolean;
  recentOneStep: SensitivityWindowMetrics;
  longOneStep: SensitivityWindowMetrics;
  qualityChecks: PromotionQualityChecks | null;
}

export interface ParameterSensitivityGroup {
  key: ParameterSensitivityGroupKey;
  status: "evaluated" | "not-applicable";
  notApplicableReason: string | null;
  candidates: SensitivityCandidate[];
}

export interface TuningCandidate {
  label: string;
  groupKey: ParameterSensitivityGroupKey;
  params: ForecastModelParams;
  recentOneStep: SensitivityWindowMetrics;
  longOneStep: SensitivityWindowMetrics;
  qualityChecks: PromotionQualityChecks;
  meetsPromotionQuality: boolean;
}

export interface ParameterSensitivity {
  version: number;
  evaluatedAt: string;
  currentParams: ForecastModelParams;
  currentRecentOneStep: SensitivityWindowMetrics;
  currentLongOneStep: SensitivityWindowMetrics;
  sampleSufficient: boolean;
  groups: ParameterSensitivityGroup[];
  tuningCandidates: TuningCandidate[];
}

const WindowMetricsSchema = z.object({
  sampleCount: z.number(),
  maeKrwPerL: z.number().nullable(),
  mapePct: z.number().nullable(),
  maxAbsoluteErrorKrwPerL: z.number().nullable(),
  directionAccuracyRatio: z.number().nullable(),
  forecastChurnKrwPerL: z.number().nullable(),
});

const IndicatorParamsSchema = z.object({ lagWeeks: z.number(), weight: z.number() }).nullable();

const ModelParamsSchema = z.object({
  modelId: z.enum(["A", "B", "C"]),
  trendLookbackWeeks: z.number(),
  dubai: IndicatorParamsSchema,
  usdKrw: IndicatorParamsSchema,
  externalAdjustmentCapRatio: z.number(),
});

const QualityChecksSchema = z.object({
  maeImprovementRatio: z.number().nullable(),
  mapeImprovementPctPoint: z.number().nullable(),
  meetsMinimumImprovement: z.boolean(),
  longStable: z.boolean(),
  maxErrorStable: z.boolean(),
  churnStable: z.boolean(),
});

const SensitivityMetadataSchema = z.object({
  model: z.object({
    parameterSensitivity: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      currentParams: ModelParamsSchema,
      currentRecentOneStep: WindowMetricsSchema,
      currentLongOneStep: WindowMetricsSchema,
      sampleSufficient: z.boolean(),
      groups: z.array(
        z.object({
          key: z.enum(["trendLookback", "dubai", "usdKrw", "cap"]),
          status: z.enum(["evaluated", "not-applicable"]),
          notApplicableReason: z.string().nullable(),
          candidates: z.array(
            z.object({
              label: z.string(),
              params: ModelParamsSchema,
              isCurrent: z.boolean(),
              recentOneStep: WindowMetricsSchema,
              longOneStep: WindowMetricsSchema,
              qualityChecks: QualityChecksSchema.nullable(),
            }),
          ),
        }),
      ),
      tuningCandidates: z.array(
        z.object({
          label: z.string(),
          groupKey: z.enum(["trendLookback", "dubai", "usdKrw", "cap"]),
          params: ModelParamsSchema,
          recentOneStep: WindowMetricsSchema,
          longOneStep: WindowMetricsSchema,
          qualityChecks: QualityChecksSchema,
          meetsPromotionQuality: z.boolean(),
        }),
      ),
    }),
  }),
});

function toWindowMetrics(
  metrics: RunWalkForwardBacktestResult["recentOneStep"],
): SensitivityWindowMetrics {
  return {
    sampleCount: metrics.sampleCount,
    maeKrwPerL: metrics.maeKrwPerL,
    mapePct: metrics.mapePct,
    maxAbsoluteErrorKrwPerL: metrics.maxAbsoluteErrorKrwPerL,
    directionAccuracyRatio: metrics.directionAccuracyRatio,
    forecastChurnKrwPerL: metrics.forecastChurnKrwPerL,
  };
}

export function serializeSensitivityParamsKey(params: ForecastModelParams): string {
  const dubai = params.dubai === null ? "none" : `${params.dubai.lagWeeks}:${params.dubai.weight}`;
  const usdKrw = params.usdKrw === null ? "none" : `${params.usdKrw.lagWeeks}:${params.usdKrw.weight}`;

  return [
    params.modelId,
    params.trendLookbackWeeks,
    dubai,
    usdKrw,
    params.externalAdjustmentCapRatio,
  ].join("|");
}

function describeIndicator(indicator: ForecastModelParams["dubai"]): string {
  return indicator === null ? "미사용" : `lag ${indicator.lagWeeks}주 · weight ${(indicator.weight * 100).toFixed(1)}%`;
}

function resolveModelId(params: ForecastModelParams): ForecastModelParams["modelId"] {
  if (params.usdKrw !== null) {
    return "C";
  }

  return params.dubai === null ? "A" : "B";
}

function withParams(base: ForecastModelParams, overrides: Partial<ForecastModelParams>): ForecastModelParams {
  const merged = { ...base, ...overrides };
  return { ...merged, modelId: resolveModelId(merged) };
}

function buildGroupParams(
  currentParams: ForecastModelParams,
): Record<ParameterSensitivityGroupKey, { label: string; params: ForecastModelParams }[]> {
  const trendLookback = DIAGNOSTIC_TREND_LOOKBACK_CANDIDATES.map((weeks) => ({
    label: `${weeks}주`,
    params: withParams(currentParams, { trendLookbackWeeks: weeks }),
  }));
  const dubaiWeights = DUBAI_WEIGHT_CANDIDATES.filter((weight) => weight > 0);
  const dubai = [
    { label: "미사용", params: withParams(currentParams, { dubai: null, usdKrw: null }) },
    ...DUBAI_LAG_WEEK_CANDIDATES.flatMap((lagWeeks) =>
      dubaiWeights.map((weight) => ({
        label: `lag ${lagWeeks}주 · weight ${(weight * 100).toFixed(1)}%`,
        params: withParams(currentParams, { dubai: { lagWeeks, weight } }),
      })),
    ),
  ];
  const usdKrwWeights = USD_KRW_WEIGHT_CANDIDATES.filter((weight) => weight > 0);
  const usdKrw = [
    { label: "미사용", params: withParams(currentParams, { usdKrw: null }) },
    ...USD_KRW_LAG_WEEK_CANDIDATES.flatMap((lagWeeks) =>
      usdKrwWeights.map((weight) => ({
        label: `lag ${lagWeeks}주 · weight ${(weight * 100).toFixed(1)}%`,
        params: withParams(currentParams, { usdKrw: { lagWeeks, weight } }),
      })),
    ),
  ];
  const cap = EXTERNAL_ADJUSTMENT_CAP_CANDIDATES.map((ratio) => ({
    label: `±${(ratio * 100).toFixed(0)}%`,
    params: withParams(currentParams, { externalAdjustmentCapRatio: ratio }),
  }));

  return { trendLookback, dubai, usdKrw, cap };
}

export interface BuildParameterSensitivityInput {
  currentParams: ForecastModelParams;
  currentBacktest: RunWalkForwardBacktestResult;
  /** 이미 평가된 후보를 재사용하고, 없을 때만 새 walk-forward를 실행한다. */
  evaluate: (params: ForecastModelParams) => RunWalkForwardBacktestResult | null;
  evaluatedAt: Date;
}

/**
 * one-factor-at-a-time 방식으로 파라미터 대안을 비교한다.
 * 운영 파라미터나 모델 선택 결과는 변경하지 않는 진단 전용 계산이다.
 */
export function buildParameterSensitivity({
  currentParams,
  currentBacktest,
  evaluate,
  evaluatedAt,
}: BuildParameterSensitivityInput): ParameterSensitivity {
  const currentKey = serializeSensitivityParamsKey(currentParams);
  const groupParams = buildGroupParams(currentParams);
  const usdKrwEvaluable = currentParams.dubai !== null || currentParams.usdKrw !== null;
  const groups: ParameterSensitivityGroup[] = (
    ["trendLookback", "dubai", "usdKrw", "cap"] as ParameterSensitivityGroupKey[]
  ).map((key) => {
    if (key === "usdKrw" && !usdKrwEvaluable) {
      return {
        key,
        status: "not-applicable",
        notApplicableReason: "USD/KRW 민감도는 Dubai 보정을 사용하는 모델에서 평가할 수 있습니다.",
        candidates: [],
      };
    }

    const candidates = groupParams[key].flatMap((candidate) => {
      const candidateKey = serializeSensitivityParamsKey(candidate.params);
      const isCurrent = candidateKey === currentKey;
      const backtest = isCurrent ? currentBacktest : evaluate(candidate.params);

      if (backtest === null) {
        return [];
      }

      return [
        {
          label: candidate.label,
          params: candidate.params,
          isCurrent,
          recentOneStep: toWindowMetrics(backtest.recentOneStep),
          longOneStep: toWindowMetrics(backtest.longOneStep),
          qualityChecks: isCurrent ? null : evaluatePromotionQuality(currentBacktest, backtest),
        },
      ];
    });

    return { key, status: "evaluated" as const, notApplicableReason: null, candidates };
  });
  const sampleSufficient = currentBacktest.recentOneStep.sampleCount >= PROMOTION_MIN_SAMPLE_COUNT;
  const tuningCandidates = !sampleSufficient
    ? []
    : groups
        .flatMap((group) =>
          group.candidates.flatMap((candidate) =>
            candidate.isCurrent || candidate.qualityChecks === null
              ? []
              : [
                  {
                    label: candidate.label,
                    groupKey: group.key,
                    params: candidate.params,
                    recentOneStep: candidate.recentOneStep,
                    longOneStep: candidate.longOneStep,
                    qualityChecks: candidate.qualityChecks,
                    meetsPromotionQuality:
                      candidate.qualityChecks.meetsMinimumImprovement &&
                      candidate.qualityChecks.longStable &&
                      candidate.qualityChecks.maxErrorStable &&
                      candidate.qualityChecks.churnStable,
                  },
                ],
          ),
        )
        .filter((candidate) => candidate.meetsPromotionQuality)
        .sort(
          (left, right) =>
            (left.recentOneStep.maeKrwPerL ?? Number.POSITIVE_INFINITY) -
            (right.recentOneStep.maeKrwPerL ?? Number.POSITIVE_INFINITY),
        )
        .slice(0, TUNING_CANDIDATE_LIMIT);

  return {
    version: PARAMETER_SENSITIVITY_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    currentParams,
    currentRecentOneStep: toWindowMetrics(currentBacktest.recentOneStep),
    currentLongOneStep: toWindowMetrics(currentBacktest.longOneStep),
    sampleSufficient,
    groups,
    tuningCandidates,
  };
}

export function readParameterSensitivity(metadata: unknown): ParameterSensitivity | null {
  const parsed = SensitivityMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.parameterSensitivity : null;
}

export function describeSensitivityParams(params: ForecastModelParams): string {
  return [
    `Model ${params.modelId}`,
    `Trend ${params.trendLookbackWeeks}주`,
    `Dubai ${describeIndicator(params.dubai)}`,
    `USD/KRW ${describeIndicator(params.usdKrw)}`,
    `Cap ±${(params.externalAdjustmentCapRatio * 100).toFixed(0)}%`,
  ].join(" · ");
}
