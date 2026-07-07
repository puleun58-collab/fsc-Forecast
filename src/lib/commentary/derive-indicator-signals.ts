import type { ExternalIndicatorCode } from "../external-indicators/types";

import {
  REQUIRED_COMMENTARY_INDICATOR_CODES,
  type CommentaryDirection,
  type CommentaryIndicatorInput,
  type CommentaryIndicatorSignal,
  type CommentaryPricePressure,
  type CommentarySignalStrength,
  type CommentaryObservedValue,
  type DeriveIndicatorSignalsResult,
} from "./types";

function compareObservedValues(left: CommentaryObservedValue, right: CommentaryObservedValue): number {
  return left.observedAt.getTime() - right.observedAt.getTime();
}

function normalizePoints(points: readonly CommentaryObservedValue[]): CommentaryObservedValue[] {
  const normalized = [...points].sort(compareObservedValues);

  for (const point of normalized) {
    if (Number.isNaN(point.observedAt.getTime())) {
      throw new Error("Commentary indicator observedAt must be a valid Date.");
    }

    if (!Number.isFinite(point.value)) {
      throw new Error("Commentary indicator value must be finite.");
    }
  }

  return normalized;
}

function deriveDirection(change: number): CommentaryDirection {
  if (change > 0) {
    return "up";
  }

  if (change < 0) {
    return "down";
  }

  return "flat";
}

function derivePressure(direction: CommentaryDirection): CommentaryPricePressure {
  if (direction === "up") {
    return "upward";
  }

  if (direction === "down") {
    return "downward";
  }

  return "neutral";
}

function deriveStrength(indicatorCode: ExternalIndicatorCode, percentChange: number): CommentarySignalStrength {
  const absolutePercentChange = Math.abs(percentChange);
  const moderateThreshold = indicatorCode === "usd-krw" ? 0.3 : 1;
  const strongThreshold = indicatorCode === "usd-krw" ? 1 : 3;

  if (absolutePercentChange >= strongThreshold) {
    return "strong";
  }

  if (absolutePercentChange >= moderateThreshold) {
    return "moderate";
  }

  return "weak";
}

function getIndicatorLabel(indicatorCode: ExternalIndicatorCode): string {
  switch (indicatorCode) {
    case "dubai":
      return "두바이유";
    case "brent":
      return "브렌트유";
    case "wti":
      return "WTI";
    case "usd-krw":
      return "USD/KRW";
  }
}

function getPressurePhrase(pressure: CommentaryPricePressure): string {
  switch (pressure) {
    case "upward":
      return "상방 압력";
    case "downward":
      return "하방 압력";
    case "neutral":
      return "중립 요인";
  }
}

function createSignal(input: CommentaryIndicatorInput): CommentaryIndicatorSignal | null {
  const normalizedPoints = normalizePoints(input.points);

  if (normalizedPoints.length < 2) {
    return null;
  }

  const latestPoint = normalizedPoints[normalizedPoints.length - 1];
  const previousPoint = normalizedPoints[normalizedPoints.length - 2];
  const absoluteChange = latestPoint.value - previousPoint.value;
  const percentChange = previousPoint.value === 0 ? 0 : (absoluteChange / previousPoint.value) * 100;
  const direction = deriveDirection(absoluteChange);
  const pressure = derivePressure(direction);
  const strength = deriveStrength(input.indicatorCode, percentChange);
  const indicatorLabel = getIndicatorLabel(input.indicatorCode);
  const changeDisplay = `${Math.abs(percentChange).toFixed(1)}%`;

  return {
    indicatorCode: input.indicatorCode,
    latestObservedAt: latestPoint.observedAt,
    previousObservedAt: previousPoint.observedAt,
    latestValue: latestPoint.value,
    previousValue: previousPoint.value,
    absoluteChange,
    percentChange,
    direction,
    pressure,
    strength,
    reasonText:
      direction === "flat"
        ? `${indicatorLabel}는 직전 대비 큰 변화가 없어 중립입니다.`
        : `${indicatorLabel}가 직전 대비 ${changeDisplay} ${direction === "up" ? "상승" : "하락"}해 경유가 ${getPressurePhrase(pressure)}으로 해석됩니다.`,
  };
}

export function deriveIndicatorSignals(
  indicators: readonly CommentaryIndicatorInput[],
): DeriveIndicatorSignalsResult {
  const indicatorsByCode = new Map<ExternalIndicatorCode, CommentaryIndicatorInput>();

  for (const indicator of indicators) {
    indicatorsByCode.set(indicator.indicatorCode, indicator);
  }

  const missingIndicatorCodes: ExternalIndicatorCode[] = [];
  const signals: CommentaryIndicatorSignal[] = [];

  for (const indicatorCode of REQUIRED_COMMENTARY_INDICATOR_CODES) {
    const indicator = indicatorsByCode.get(indicatorCode);

    if (!indicator) {
      missingIndicatorCodes.push(indicatorCode);
      continue;
    }

    const signal = createSignal(indicator);

    if (!signal) {
      missingIndicatorCodes.push(indicatorCode);
      continue;
    }

    signals.push(signal);
  }

  return {
    signals,
    missingIndicatorCodes,
  };
}
