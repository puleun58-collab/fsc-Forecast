import { z } from "zod";

import {
  FALLBACK_FORECAST_MODEL_PARAMS,
  type ForecastModelParams,
} from "./forecast-model-config";

const IndicatorParamsSchema = z
  .object({
    lagWeeks: z.number().int().min(1).max(8),
    weight: z.number().gt(0).max(1),
  })
  .nullable();

const ForecastModelStateSchema = z.object({
  model: z.object({
    version: z.string().nullish(),
    promotedAt: z.string().datetime().nullish(),
    params: z.object({
      modelId: z.enum(["A", "B", "C"]),
      trendLookbackWeeks: z.number().int().min(2).max(52),
      dubai: IndicatorParamsSchema.optional().default(null),
      usdKrw: IndicatorParamsSchema.optional().default(null),
      externalAdjustmentCapRatio: z.number().min(0).max(0.2),
      biasCorrection: z
        .object({ lookbackWeeks: z.number().int().min(2).max(52), weight: z.number().gt(0).max(1) })
        .nullish()
        .transform((value) => value ?? null),
      dailySignal: z
        .object({
          lookbackObservations: z.number().int().min(2).max(30),
          weight: z.number().gt(0).max(1),
        })
        .nullish()
        .transform((value) => value ?? null),
    }),
  }),
});

export interface StoredForecastModelState {
  params: ForecastModelParams;
  promotedAt: Date | null;
  modelVersion: string | null;
}

export function readForecastModelState(metadata: unknown): StoredForecastModelState | null {
  const parsed = ForecastModelStateSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  const { model } = parsed.data;

  return {
    params: {
      modelId: model.params.modelId,
      trendLookbackWeeks: model.params.trendLookbackWeeks,
      dubai: model.params.dubai,
      usdKrw: model.params.usdKrw,
      externalAdjustmentCapRatio: model.params.externalAdjustmentCapRatio,
      biasCorrection: model.params.biasCorrection,
      dailySignal: model.params.dailySignal,
    },
    promotedAt: model.promotedAt ? new Date(model.promotedAt) : null,
    modelVersion: model.version ?? null,
  };
}

export function resolveForecastModelState(metadata: unknown): StoredForecastModelState {
  return (
    readForecastModelState(metadata) ?? {
      params: FALLBACK_FORECAST_MODEL_PARAMS,
      promotedAt: null,
      modelVersion: null,
    }
  );
}

export function serializeForecastModelParams(
  params: ForecastModelParams,
): Record<string, unknown> {
  return {
    modelId: params.modelId,
    trendLookbackWeeks: params.trendLookbackWeeks,
    dubai: params.dubai === null ? null : { ...params.dubai },
    usdKrw: params.usdKrw === null ? null : { ...params.usdKrw },
    externalAdjustmentCapRatio: params.externalAdjustmentCapRatio,
    biasCorrection: params.biasCorrection === null ? null : { ...params.biasCorrection },
    dailySignal: params.dailySignal === null ? null : { ...params.dailySignal },
  };
}
