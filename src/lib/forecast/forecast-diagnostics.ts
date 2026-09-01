import { z } from "zod";

import {
  PROMOTION_COOLDOWN_DAYS,
  PROMOTION_LONG_WINDOW_TOLERANCE_RATIO,
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_MIN_SAMPLE_COUNT,
  PROMOTION_VOLATILITY_TOLERANCE_RATIO,
  RECENT_EVALUATION_WEEKS,
  LONG_EVALUATION_WEEKS,
  type ForecastModelId,
} from "./forecast-model-config";

const PROMOTION_REASON_TEXT: Record<string, string> = {
  kept_current_model: "현재 모델을 유지했습니다.",
  kept_current_model_no_eligible_candidate: "승격 조건을 충족한 후보 모델이 없습니다.",
  kept_current_model_already_best: "현재 모델이 후보 중 가장 우수합니다.",
  kept_current_model_promotion_cooldown:
    "최근 모델 변경 후 안정화 기간이 지나지 않아 현재 모델을 유지합니다.",
  kept_current_model_improvement_below_minimum:
    "후보 모델의 최근 성능 개선폭이 승격 기준보다 작아 현재 모델을 유지합니다.",
  kept_current_model_long_window_degraded:
    "후보 모델의 장기 성능이 안정성 기준을 충족하지 못했습니다.",
  kept_current_model_max_error_increased: "후보 모델의 최대 오차가 허용 범위를 초과했습니다.",
  kept_current_model_forecast_volatility_increased:
    "후보 모델의 예측 변동성이 허용 범위를 초과했습니다.",
  promoted_bootstrap_no_current_metrics:
    "기존 모델의 비교 지표가 부족하여 최적 후보 모델을 적용했습니다.",
  promoted_recent_improvement_with_long_stability:
    "최근 성능이 의미 있게 개선되고 장기 안정성 기준도 충족하여 모델을 승격했습니다.",
};

export function mapPromotionReason(code: string | null): string {
  if (code === null) {
    return "판단 사유 기록 없음";
  }

  return PROMOTION_REASON_TEXT[code] ?? `기록된 사유 코드: ${code}`;
}

export interface ForecastPromotionThreshold {
  label: string;
  value: string;
}

export const FORECAST_PROMOTION_THRESHOLDS: readonly ForecastPromotionThreshold[] = [
  { label: "최근 평가 구간", value: `${RECENT_EVALUATION_WEEKS}주` },
  { label: "장기 평가 구간", value: `${LONG_EVALUATION_WEEKS}주` },
  { label: "승격 최소 표본 수", value: `${PROMOTION_MIN_SAMPLE_COUNT}개` },
  {
    label: "최근 MAE 최소 개선 기준",
    value: `${(PROMOTION_MIN_MAE_IMPROVEMENT_RATIO * 100).toFixed(1)}%`,
  },
  {
    label: "최근 MAPE 최소 개선 기준",
    value: `${PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT.toFixed(2)}%p`,
  },
  {
    label: "장기 성능 허용 범위",
    value: `현재 모델의 ${(PROMOTION_LONG_WINDOW_TOLERANCE_RATIO * 100).toFixed(0)}% 이내`,
  },
  {
    label: "최대 오차 허용 범위",
    value: `현재 모델의 ${(PROMOTION_MAX_ERROR_TOLERANCE_RATIO * 100).toFixed(0)}% 이내`,
  },
  {
    label: "예측 변동성 허용 범위",
    value: `현재 모델의 ${(PROMOTION_VOLATILITY_TOLERANCE_RATIO * 100).toFixed(0)}% 이내`,
  },
  { label: "승격 쿨다운", value: `${PROMOTION_COOLDOWN_DAYS}일` },
];

const NullableNumber = z.number().nullish().transform((value) => value ?? null);

const IndicatorParamsSchema = z
  .object({ lagWeeks: z.number(), weight: z.number() })
  .nullish()
  .transform((value) => value ?? null);

const ModelParamsSchema = z.object({
  modelId: z.enum(["A", "B", "C"]),
  trendLookbackWeeks: z.number(),
  dubai: IndicatorParamsSchema,
  usdKrw: IndicatorParamsSchema,
  externalAdjustmentCapRatio: z.number(),
});

const WindowMetricsSchema = z
  .object({
    sampleCount: z.number().nullish().transform((value) => value ?? 0),
    maeKrwPerL: NullableNumber,
    mapePct: NullableNumber,
    maxAbsoluteErrorKrwPerL: NullableNumber,
    forecastChurnKrwPerL: NullableNumber,
  })
  .nullish()
  .transform((value) => value ?? null);

const CandidateSummarySchema = z
  .object({
    modelId: z.enum(["A", "B", "C"]),
    params: ModelParamsSchema,
    recentSampleCount: z.number().nullish().transform((value) => value ?? 0),
    recentMaeKrwPerL: NullableNumber,
    recentMapePct: NullableNumber,
    longMaeKrwPerL: NullableNumber,
    maxAbsoluteErrorKrwPerL: NullableNumber,
    forecastChurnKrwPerL: NullableNumber,
  })
  .nullish()
  .transform((value) => value ?? null);

const ForecastDiagnosticsSchema = z.object({
  model: z.object({
    version: z.string().nullish().transform((value) => value ?? null),
    promotedAt: z.string().nullish().transform((value) => value ?? null),
    params: ModelParamsSchema,
    promoted: z.boolean().nullish().transform((value) => value ?? false),
    promotionReason: z.string().nullish().transform((value) => value ?? null),
    previousParams: ModelParamsSchema.nullish().transform((value) => value ?? null),
    maeImprovementRatio: NullableNumber,
    mapeImprovementPctPoint: NullableNumber,
    evaluatedCandidateCount: z.number().nullish().transform((value) => value ?? 0),
    bestByModelId: z
      .object({ A: CandidateSummarySchema, B: CandidateSummarySchema, C: CandidateSummarySchema })
      .nullish()
      .transform((value) => value ?? null),
    recent: WindowMetricsSchema,
    long: WindowMetricsSchema,
    currentModelRecent: WindowMetricsSchema,
  }),
});

export type ForecastModelParamsView = z.infer<typeof ModelParamsSchema>;
export type ForecastWindowMetricsView = NonNullable<z.infer<typeof WindowMetricsSchema>>;

export type ForecastCandidateStatus = "selected" | "candidate" | "insufficient_sample";

export interface ForecastCandidateView {
  modelId: ForecastModelId;
  params: ForecastModelParamsView;
  recentSampleCount: number;
  recentMaeKrwPerL: number | null;
  recentMapePct: number | null;
  longMaeKrwPerL: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  forecastChurnKrwPerL: number | null;
  status: ForecastCandidateStatus;
}

export interface ForecastModelDiagnostics {
  modelVersion: string | null;
  promotedAt: string | null;
  promoted: boolean;
  promotionReason: string | null;
  promotionReasonText: string;
  selectedParams: ForecastModelParamsView;
  previousModelId: ForecastModelId | null;
  modelChanged: boolean;
  evaluatedCandidateCount: number;
  maeImprovementRatio: number | null;
  mapeImprovementPctPoint: number | null;
  recent: ForecastWindowMetricsView | null;
  long: ForecastWindowMetricsView | null;
  currentModelRecent: ForecastWindowMetricsView | null;
  candidates: ForecastCandidateView[];
}

export function readForecastModelDiagnostics(metadata: unknown): ForecastModelDiagnostics | null {
  const parsed = ForecastDiagnosticsSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  const { model } = parsed.data;
  const candidates = (["A", "B", "C"] as const).flatMap((modelId) => {
    const summary = model.bestByModelId?.[modelId] ?? null;

    if (summary === null) {
      return [];
    }

    const selected =
      summary.params.modelId === model.params.modelId &&
      summary.params.trendLookbackWeeks === model.params.trendLookbackWeeks &&
      summary.params.dubai?.lagWeeks === model.params.dubai?.lagWeeks &&
      summary.params.dubai?.weight === model.params.dubai?.weight &&
      summary.params.usdKrw?.lagWeeks === model.params.usdKrw?.lagWeeks &&
      summary.params.usdKrw?.weight === model.params.usdKrw?.weight;

    return [
      {
        modelId,
        params: summary.params,
        recentSampleCount: summary.recentSampleCount,
        recentMaeKrwPerL: summary.recentMaeKrwPerL,
        recentMapePct: summary.recentMapePct,
        longMaeKrwPerL: summary.longMaeKrwPerL,
        maxAbsoluteErrorKrwPerL: summary.maxAbsoluteErrorKrwPerL,
        forecastChurnKrwPerL: summary.forecastChurnKrwPerL,
        status: selected
          ? ("selected" as const)
          : summary.recentSampleCount < PROMOTION_MIN_SAMPLE_COUNT
            ? ("insufficient_sample" as const)
            : ("candidate" as const),
      },
    ];
  });

  return {
    modelVersion: model.version,
    promotedAt: model.promotedAt,
    promoted: model.promoted,
    promotionReason: model.promotionReason,
    promotionReasonText: mapPromotionReason(model.promotionReason),
    selectedParams: model.params,
    previousModelId: model.previousParams?.modelId ?? null,
    modelChanged:
      model.previousParams !== null && model.previousParams.modelId !== model.params.modelId,
    evaluatedCandidateCount: model.evaluatedCandidateCount,
    maeImprovementRatio: model.maeImprovementRatio,
    mapeImprovementPctPoint: model.mapeImprovementPctPoint,
    recent: model.recent,
    long: model.long,
    currentModelRecent: model.currentModelRecent,
    candidates,
  };
}
