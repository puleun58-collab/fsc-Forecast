import { buildCommentaryText } from "./build-commentary-text";
import { deriveIndicatorSignals } from "./derive-indicator-signals";
import {
  COMMENTARY_RULE_SET_VERSION,
  type CommentaryDriverEvidence,
  type CommentaryPipelineResult,
  type CommentaryPriceInput,
  type CommentaryPriceSignal,
  type CommentarySignalStrength,
  type RunCommentaryPipelineInput,
} from "./types";

function derivePriceSignal(
  latestPrice: CommentaryPriceInput,
  previousPrice: CommentaryPriceInput | null | undefined,
): CommentaryPriceSignal {
  if (Number.isNaN(latestPrice.observedAt.getTime())) {
    throw new Error("Commentary latestPrice observedAt must be a valid Date.");
  }

  if (!Number.isFinite(latestPrice.priceKrwPerL)) {
    throw new Error("Commentary latestPrice priceKrwPerL must be finite.");
  }

  if (!previousPrice) {
    return {
      latestObservedAt: latestPrice.observedAt,
      previousObservedAt: null,
      latestPriceKrwPerL: latestPrice.priceKrwPerL,
      previousPriceKrwPerL: null,
      absoluteChangeKrwPerL: null,
      percentChange: null,
      direction: "flat",
    };
  }

  if (Number.isNaN(previousPrice.observedAt.getTime())) {
    throw new Error("Commentary previousPrice observedAt must be a valid Date.");
  }

  if (!Number.isFinite(previousPrice.priceKrwPerL)) {
    throw new Error("Commentary previousPrice priceKrwPerL must be finite.");
  }

  const absoluteChangeKrwPerL = latestPrice.priceKrwPerL - previousPrice.priceKrwPerL;
  const percentChange =
    previousPrice.priceKrwPerL === 0
      ? 0
      : (absoluteChangeKrwPerL / previousPrice.priceKrwPerL) * 100;

  return {
    latestObservedAt: latestPrice.observedAt,
    previousObservedAt: previousPrice.observedAt,
    latestPriceKrwPerL: latestPrice.priceKrwPerL,
    previousPriceKrwPerL: previousPrice.priceKrwPerL,
    absoluteChangeKrwPerL,
    percentChange,
    direction:
      absoluteChangeKrwPerL > 0 ? "up" : absoluteChangeKrwPerL < 0 ? "down" : "flat",
  };
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

function deriveDominantPressures(
  signals: CommentaryPipelineResult["signals"],
): CommentaryDriverEvidence[] {
  return [...signals]
    .sort((left, right) => getStrengthWeight(right.strength) - getStrengthWeight(left.strength))
    .slice(0, 3)
    .map((signal) => ({
      indicatorCode: signal.indicatorCode,
      pressure: signal.pressure,
      strength: signal.strength,
      reasonText: signal.reasonText,
    }));
}

export function runCommentaryPipeline(
  input: RunCommentaryPipelineInput,
): CommentaryPipelineResult {
  if (!input.recomputeSnapshotId.trim()) {
    throw new Error("Commentary pipeline requires a recomputeSnapshotId.");
  }

  const generatedAt = input.generatedAt ?? new Date();

  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("Commentary generatedAt must be a valid Date.");
  }

  const latestPrice = derivePriceSignal(input.latestPrice, input.previousPrice);
  const indicatorSignalsResult = deriveIndicatorSignals(input.indicators);
  const dominantPressures = deriveDominantPressures(indicatorSignalsResult.signals);
  const hasCompleteIndicatorSet = indicatorSignalsResult.missingIndicatorCodes.length === 0;

  if (!hasCompleteIndicatorSet) {
    const commentaryText = "근거 지표가 아직 부족해 전국 평균 경유가 해설을 생성하지 못했습니다.";

    return {
      status: "insufficient_data",
      recomputeSnapshotId: input.recomputeSnapshotId,
      generatedAt,
      marketScope: "national-average",
      ruleSetVersion: COMMENTARY_RULE_SET_VERSION,
      commentaryText,
      signals: indicatorSignalsResult.signals,
      evidence: {
        recomputeSnapshotId: input.recomputeSnapshotId,
        generatedAt,
        marketScope: "national-average",
        ruleSetVersion: COMMENTARY_RULE_SET_VERSION,
        latestPrice,
        indicatorSignals: indicatorSignalsResult.signals,
        dominantPressures,
        missingIndicatorCodes: indicatorSignalsResult.missingIndicatorCodes,
      },
    };
  }

  const commentaryTextResult = buildCommentaryText({
    latestPrice,
    indicatorSignals: indicatorSignalsResult.signals,
  });

  return {
    status: "ready",
    recomputeSnapshotId: input.recomputeSnapshotId,
    generatedAt,
    marketScope: "national-average",
    ruleSetVersion: COMMENTARY_RULE_SET_VERSION,
    commentaryText: commentaryTextResult.text,
    signals: indicatorSignalsResult.signals,
    evidence: {
      recomputeSnapshotId: input.recomputeSnapshotId,
      generatedAt,
      marketScope: "national-average",
      ruleSetVersion: COMMENTARY_RULE_SET_VERSION,
      latestPrice,
      indicatorSignals: indicatorSignalsResult.signals,
      dominantPressures,
      missingIndicatorCodes: indicatorSignalsResult.missingIndicatorCodes,
    },
  };
}
