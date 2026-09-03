import { describeBiasCorrection } from "./bias-correction";
import { describeDailySignal } from "./daily-signal";
import type { ForecastIndicatorParams, ForecastModelParams } from "./forecast-model-config";

/** 모든 화면이 같은 순서로 파라미터를 보여주도록 한 곳에서 정의한다. */
export type ModelParamFieldKey =
  | "model"
  | "trend"
  | "dubaiLag"
  | "dubaiWeight"
  | "usdKrw"
  | "cap"
  | "bias"
  | "dailySignal";

export interface ModelParamField {
  key: ModelParamFieldKey;
  label: string;
  value: string;
}

function formatWeightPercent(weight: number): string {
  return `${Number((weight * 100).toFixed(1))}%`;
}

function formatIndicator(indicator: ForecastIndicatorParams | null): string {
  return indicator === null
    ? "미사용"
    : `반영 시차 ${indicator.lagWeeks}주 · 반영 비중 ${formatWeightPercent(indicator.weight)}`;
}

/** Dubai는 시차와 비중을 별도 항목으로 나눠 변경점을 정확히 짚을 수 있게 한다. */
export function listModelParamFields(params: ForecastModelParams): ModelParamField[] {
  return [
    { key: "model", label: "Model", value: params.modelId },
    { key: "trend", label: "Trend", value: `${params.trendLookbackWeeks}주` },
    {
      key: "dubaiLag",
      label: "Dubai 반영 시차",
      value: params.dubai === null ? "미사용" : `${params.dubai.lagWeeks}주`,
    },
    {
      key: "dubaiWeight",
      label: "Dubai 반영 비중",
      value: params.dubai === null ? "미사용" : formatWeightPercent(params.dubai.weight),
    },
    { key: "usdKrw", label: "USD/KRW", value: formatIndicator(params.usdKrw) },
    {
      key: "cap",
      label: "Cap",
      value: `±${(params.externalAdjustmentCapRatio * 100).toFixed(0)}%`,
    },
    { key: "bias", label: "Bias 보정", value: describeBiasCorrection(params.biasCorrection) },
    {
      key: "dailySignal",
      label: "일별 단기 신호",
      value: describeDailySignal(params.dailySignal),
    },
  ];
}

export interface FormatModelParamsOptions {
  /** 모바일 1차 요약. 실제 변경이 잦은 Trend와 Dubai만 남긴다. */
  compact?: boolean;
}

/**
 * 관리자 화면 전체가 같은 문자열을 쓰도록 하는 단일 포맷터.
 * 순서는 Model → Trend → Dubai 시차 → Dubai 비중 → USD/KRW → Cap 고정이다.
 */
export function formatModelParams(
  params: ForecastModelParams,
  { compact = false }: FormatModelParamsOptions = {},
): string {
  if (compact) {
    const dubai =
      params.dubai === null
        ? "Dubai 미사용"
        : `Dubai ${params.dubai.lagWeeks}주 / ${formatWeightPercent(params.dubai.weight)}`;

    return `Trend ${params.trendLookbackWeeks}주 · ${dubai}`;
  }

  const dubai =
    params.dubai === null
      ? "Dubai 미사용"
      : `Dubai 반영 시차 ${params.dubai.lagWeeks}주 · 반영 비중 ${formatWeightPercent(params.dubai.weight)}`;

  return [
    `Model ${params.modelId}`,
    `Trend ${params.trendLookbackWeeks}주`,
    dubai,
    `USD/KRW ${formatIndicator(params.usdKrw)}`,
    `Cap ±${(params.externalAdjustmentCapRatio * 100).toFixed(0)}%`,
    // 진단 후보 항목은 실제 사용 중일 때만 덧붙인다.
    ...(params.biasCorrection === null
      ? []
      : [`Bias 보정 ${describeBiasCorrection(params.biasCorrection)}`]),
    ...(params.dailySignal === null
      ? []
      : [`일별 단기 신호 ${describeDailySignal(params.dailySignal)}`]),
  ].join(" · ");
}

/** compact 요약에서 빠지는 나머지 설정. 상세 줄로 이어 붙인다. */
export function formatModelParamsRest(params: ForecastModelParams): string {
  return [
    `Model ${params.modelId}`,
    `USD/KRW ${formatIndicator(params.usdKrw)}`,
    `Cap ±${(params.externalAdjustmentCapRatio * 100).toFixed(0)}%`,
    ...(params.biasCorrection === null
      ? []
      : [`Bias 보정 ${describeBiasCorrection(params.biasCorrection)}`]),
    ...(params.dailySignal === null
      ? []
      : [`일별 단기 신호 ${describeDailySignal(params.dailySignal)}`]),
  ].join(" · ");
}

export interface ModelParamChange {
  key: ModelParamFieldKey;
  label: string;
  from: string;
  to: string;
}

/** 실제로 값이 달라진 항목만 돌려준다. 변하지 않은 설정을 변경점처럼 보여주지 않는다. */
export function diffModelParams(
  previous: ForecastModelParams,
  next: ForecastModelParams,
): ModelParamChange[] {
  const previousFields = listModelParamFields(previous);

  return listModelParamFields(next).flatMap((field, index) => {
    const before = previousFields[index];

    return before.value === field.value
      ? []
      : [{ key: field.key, label: field.label, from: before.value, to: field.value }];
  });
}

export function describeModelParamChanges(changes: readonly ModelParamChange[]): string | null {
  return changes.length === 0
    ? null
    : changes.map((change) => `${change.label} ${change.from} → ${change.to}`).join(" · ");
}
