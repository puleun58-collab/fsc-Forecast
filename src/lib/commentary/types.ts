import type { ExternalIndicatorCode } from "../external-indicators/types";

export const COMMENTARY_RULE_SET_VERSION = "national-average-commentary-v1";
export const REQUIRED_COMMENTARY_INDICATOR_CODES = ["dubai", "brent", "wti", "usd-krw"] as const;

export type CommentaryMarketScope = "national-average";
export type CommentaryPipelineStatus = "ready" | "insufficient_data";
export type CommentaryDirection = "up" | "down" | "flat";
export type CommentarySignalStrength = "weak" | "moderate" | "strong";
export type CommentaryPricePressure = "upward" | "downward" | "neutral";
export type CommentaryIndicatorCode = (typeof REQUIRED_COMMENTARY_INDICATOR_CODES)[number];

export interface CommentaryObservedValue {
  observedAt: Date;
  value: number;
}

export interface CommentaryPriceInput {
  observedAt: Date;
  priceKrwPerL: number;
}

export interface CommentaryIndicatorInput {
  indicatorCode: CommentaryIndicatorCode;
  points: readonly CommentaryObservedValue[];
}

export interface RunCommentaryPipelineInput {
  recomputeSnapshotId: string;
  generatedAt?: Date;
  latestPrice: CommentaryPriceInput;
  previousPrice?: CommentaryPriceInput | null;
  indicators: readonly CommentaryIndicatorInput[];
}

export interface CommentaryPriceSignal {
  latestObservedAt: Date;
  previousObservedAt: Date | null;
  latestPriceKrwPerL: number;
  previousPriceKrwPerL: number | null;
  absoluteChangeKrwPerL: number | null;
  percentChange: number | null;
  direction: CommentaryDirection;
}

export interface CommentaryIndicatorSignal {
  indicatorCode: CommentaryIndicatorCode;
  latestObservedAt: Date;
  previousObservedAt: Date;
  latestValue: number;
  previousValue: number;
  absoluteChange: number;
  percentChange: number;
  direction: CommentaryDirection;
  pressure: CommentaryPricePressure;
  strength: CommentarySignalStrength;
  reasonText: string;
}

export interface CommentaryDriverEvidence {
  indicatorCode: CommentaryIndicatorCode;
  pressure: CommentaryPricePressure;
  strength: CommentarySignalStrength;
  reasonText: string;
}

export interface CommentaryEvidencePayload {
  recomputeSnapshotId: string;
  generatedAt: Date;
  marketScope: CommentaryMarketScope;
  ruleSetVersion: string;
  latestPrice: CommentaryPriceSignal;
  indicatorSignals: CommentaryIndicatorSignal[];
  dominantPressures: CommentaryDriverEvidence[];
  missingIndicatorCodes: ExternalIndicatorCode[];
}

export interface BuildCommentaryTextInput {
  latestPrice: CommentaryPriceSignal;
  indicatorSignals: readonly CommentaryIndicatorSignal[];
}

export interface BuildCommentaryTextResult {
  headline: string;
  supportingDetail: string;
  text: string;
}

export interface DeriveIndicatorSignalsResult {
  signals: CommentaryIndicatorSignal[];
  missingIndicatorCodes: ExternalIndicatorCode[];
}

export interface CommentaryPipelineResult {
  status: CommentaryPipelineStatus;
  recomputeSnapshotId: string;
  generatedAt: Date;
  marketScope: CommentaryMarketScope;
  ruleSetVersion: string;
  commentaryText: string;
  signals: CommentaryIndicatorSignal[];
  evidence: CommentaryEvidencePayload;
}
