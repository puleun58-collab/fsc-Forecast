import { z } from "zod";

export const FORECAST_MODEL_VERSION = "weekly-anchor-trend-v2";

export const WEEKLY_TREND_LOOKBACK_WEEKS = 8;
export const WEEKLY_TREND_MIN_ACTUAL_COUNT = 3;

export const RECENT_EVALUATION_WEEKS = 13;
export const LONG_EVALUATION_WEEKS = 26;

export const RESIDUAL_QUANTILE_LEVELS = [0.5, 0.8, 0.9, 0.95] as const;
export const FORECAST_RANGE_QUANTILE_LEVEL = 0.9;

export const DUBAI_LAG_WEEK_CANDIDATES = [1, 2, 3] as const;
export const DUBAI_WEIGHT_CANDIDATES = [0, 0.05, 0.1, 0.15, 0.2] as const;
export const USD_KRW_LAG_WEEK_CANDIDATES = [1, 2, 3] as const;
export const USD_KRW_WEIGHT_CANDIDATES = [0, 0.025, 0.05, 0.075, 0.1] as const;
export const EXTERNAL_ADJUSTMENT_CAP_CANDIDATES = [0.01, 0.02, 0.03] as const;
/** 진단 전용 Bias 후보 범위. 과보정을 막기 위해 부분 반영만 시험한다. */
export const BIAS_CORRECTION_LOOKBACK_CANDIDATES = [4, 8, 13] as const;
export const BIAS_CORRECTION_WEIGHT_CANDIDATES = [0.25, 0.5] as const;
/** 진단 전용 일별 단기 신호 후보 범위. 최근 5개 관측치만 사용한다. */
export const DAILY_SIGNAL_LOOKBACK_OBSERVATIONS = 5;
export const DAILY_SIGNAL_WEIGHT_CANDIDATES = [0.25, 0.5] as const;

export const PROMOTION_MIN_SAMPLE_COUNT = 13;
export const PROMOTION_MIN_MAE_IMPROVEMENT_RATIO = 0.05;
export const PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT = 0.1;
export const PROMOTION_LONG_WINDOW_TOLERANCE_RATIO = 1.02;
export const PROMOTION_MAX_ERROR_TOLERANCE_RATIO = 1.1;
export const PROMOTION_VOLATILITY_TOLERANCE_RATIO = 2;
export const PROMOTION_COOLDOWN_DAYS = 14;

export type ForecastModelId = "A" | "B" | "C";

export interface ForecastIndicatorParams {
  lagWeeks: number;
  weight: number;
}

/** 최근 예측 편향(forecast - actual)의 일부만 되돌리는 진단 후보용 파라미터. */
export interface ForecastBiasCorrectionParams {
  lookbackWeeks: number;
  weight: number;
}

/** 최근 일별 경유가 움직임을 일부만 반영하는 진단 후보용 파라미터. */
export interface ForecastDailySignalParams {
  lookbackObservations: number;
  weight: number;
}

export interface ForecastModelParams {
  modelId: ForecastModelId;
  trendLookbackWeeks: number;
  dubai: ForecastIndicatorParams | null;
  usdKrw: ForecastIndicatorParams | null;
  externalAdjustmentCapRatio: number;
  /** 운영 전환으로 승인된 경우에만 채워진다. 기본 모델 계산은 그대로 둔다. */
  biasCorrection: ForecastBiasCorrectionParams | null;
  /** 운영 전환으로 승인된 경우에만 채워진다. 기본 모델 계산은 그대로 둔다. */
  dailySignal: ForecastDailySignalParams | null;
}

export const FALLBACK_FORECAST_MODEL_PARAMS: ForecastModelParams = {
  modelId: "A",
  trendLookbackWeeks: WEEKLY_TREND_LOOKBACK_WEEKS,
  dubai: null,
  usdKrw: null,
  externalAdjustmentCapRatio: EXTERNAL_ADJUSTMENT_CAP_CANDIDATES[1],
  biasCorrection: null,
  dailySignal: null,
};

const IndicatorParamsSchema = z
  .object({ lagWeeks: z.number(), weight: z.number() })
  .nullish()
  .transform((value) => value ?? null);

/** 저장된 모델 파라미터는 모두 이 스키마로 읽는다. 과거 run에는 새 후보 필드가 없다. */
export const ForecastModelParamsSchema = z.object({
  modelId: z.enum(["A", "B", "C"]),
  trendLookbackWeeks: z.number(),
  dubai: IndicatorParamsSchema,
  usdKrw: IndicatorParamsSchema,
  externalAdjustmentCapRatio: z.number(),
  biasCorrection: z
    .object({ lookbackWeeks: z.number(), weight: z.number() })
    .nullish()
    .transform((value) => value ?? null),
  dailySignal: z
    .object({ lookbackObservations: z.number(), weight: z.number() })
    .nullish()
    .transform((value) => value ?? null),
});
