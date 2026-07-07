import {
  type BuildCommentaryTextInput,
  type BuildCommentaryTextResult,
  type CommentaryIndicatorCode,
  type CommentaryIndicatorSignal,
  type CommentaryPricePressure,
  type CommentarySignalStrength,
} from "./types";

function getIndicatorLabel(indicatorCode: CommentaryIndicatorCode): string {
  switch (indicatorCode) {
    case "dubai":
      return "두바이유";
    case "brent":
      return "브렌트유";
    case "wti":
      return "WTI";
    case "usd-krw":
      return "원/달러 환율";
  }
}

function getStrengthWeight(strength: CommentarySignalStrength): number {
  switch (strength) {
    case "strong":
      return 3;
    case "moderate":
      return 2;
    case "weak":
      return 1;
  }
}

function getPressureScore(pressure: CommentaryPricePressure, strength: CommentarySignalStrength): number {
  const weight = getStrengthWeight(strength);

  if (pressure === "upward") {
    return weight;
  }

  if (pressure === "downward") {
    return -weight;
  }

  return 0;
}

function compareDrivers(left: CommentaryIndicatorSignal, right: CommentaryIndicatorSignal): number {
  return Math.abs(getPressureScore(right.pressure, right.strength)) - Math.abs(getPressureScore(left.pressure, left.strength));
}

function buildDriverText(signals: readonly CommentaryIndicatorSignal[]): string {
  const dominantDrivers = [...signals].sort(compareDrivers).slice(0, 2);

  if (dominantDrivers.length === 0) {
    return "지표 근거가 아직 충분하지 않습니다.";
  }

  const driverText = dominantDrivers
    .map((signal) => `${getIndicatorLabel(signal.indicatorCode)} ${signal.direction === "up" ? "상승" : signal.direction === "down" ? "하락" : "보합"}`)
    .join(", ");

  return `주요 근거는 ${driverText}입니다.`;
}

function buildHeadline(input: BuildCommentaryTextInput): string {
  const pressureScore = input.indicatorSignals.reduce(
    (total, signal) => total + getPressureScore(signal.pressure, signal.strength),
    0,
  );

  if (pressureScore >= 4) {
    return "국제유가와 환율이 함께 오르며 전국 평균 경유가 상방 압력이 커졌습니다.";
  }

  if (pressureScore <= -4) {
    return "국제유가와 환율이 함께 눌리며 전국 평균 경유가 하방 압력이 커졌습니다.";
  }

  if (pressureScore > 0) {
    return "상승 요인이 우세해 전국 평균 경유가에 완만한 상방 압력이 있습니다.";
  }

  if (pressureScore < 0) {
    return "하락 요인이 우세해 전국 평균 경유가에 완만한 하방 압력이 있습니다.";
  }

  return "국제유가와 환율 신호가 엇갈려 전국 평균 경유가 압력은 중립에 가깝습니다.";
}

function buildSupportingDetail(input: BuildCommentaryTextInput): string {
  const { latestPrice } = input;

  if (latestPrice.absoluteChangeKrwPerL === null || latestPrice.previousPriceKrwPerL === null) {
    return buildDriverText(input.indicatorSignals);
  }

  const absoluteChange = Math.abs(latestPrice.absoluteChangeKrwPerL).toFixed(1);
  const priceTrendText =
    latestPrice.direction === "up"
      ? `최근 전국 평균 경유가는 직전 대비 ${absoluteChange}원 올랐습니다.`
      : latestPrice.direction === "down"
        ? `최근 전국 평균 경유가는 직전 대비 ${absoluteChange}원 내렸습니다.`
        : "최근 전국 평균 경유가는 직전과 비슷한 수준입니다.";

  return `${priceTrendText} ${buildDriverText(input.indicatorSignals)}`;
}

export function buildCommentaryText(input: BuildCommentaryTextInput): BuildCommentaryTextResult {
  const headline = buildHeadline(input);
  const supportingDetail = buildSupportingDetail(input);

  return {
    headline,
    supportingDetail,
    text: `${headline} ${supportingDetail}`,
  };
}
