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

export interface ForecastModelParams {
  modelId: ForecastModelId;
  trendLookbackWeeks: number;
  dubai: ForecastIndicatorParams | null;
  usdKrw: ForecastIndicatorParams | null;
  externalAdjustmentCapRatio: number;
}

export const FALLBACK_FORECAST_MODEL_PARAMS: ForecastModelParams = {
  modelId: "A",
  trendLookbackWeeks: WEEKLY_TREND_LOOKBACK_WEEKS,
  dubai: null,
  usdKrw: null,
  externalAdjustmentCapRatio: EXTERNAL_ADJUSTMENT_CAP_CANDIDATES[1],
};
