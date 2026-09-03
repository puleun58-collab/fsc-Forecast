import type { DataQualityStatus, ForecastInputQuality } from "./input-quality";
import type {
  ForecastSignalContribution,
  ForecastSignalKey,
  SignalContributionStatus,
} from "./signal-contribution";
import {
  summarizeSignalForwardValidation,
  type SignalForwardStatus,
  type SignalForwardSummary,
  type SignalForwardValidation,
} from "./signal-forward-validation";

export type SignalReviewStatus = "keep" | "watch" | "review-removal" | "undecided";

export type SignalReviewReason =
  | "backtest-helpful"
  | "backtest-harmful"
  | "backtest-mixed"
  | "backtest-missing"
  | "forward-helpful"
  | "forward-harmful"
  | "forward-mixed"
  | "forward-incomplete"
  | "insufficient-usable-samples"
  | "signal-not-used"
  | "data-quality-degraded";

export interface SignalReviewDecision {
  signal: ForecastSignalKey;
  status: SignalReviewStatus;
  backtestVerdict: SignalContributionStatus | null;
  forwardVerdict: SignalForwardStatus | null;
  forwardSampleCount: number;
  forwardRequiredSampleCount: number;
  dataQualityStatus: DataQualityStatus | null;
  reasons: SignalReviewReason[];
}

const QUALITY_SOURCE_BY_SIGNAL: Partial<
  Record<ForecastSignalKey, "dubai" | "usdKrw" | "dailyDiesel">
> = {
  dubai: "dubai",
  usdKrw: "usdKrw",
  dailySignal: "dailyDiesel",
};

function readDataQualityStatus(
  inputQuality: ForecastInputQuality | null,
  signal: ForecastSignalKey,
): DataQualityStatus | null {
  const source = QUALITY_SOURCE_BY_SIGNAL[signal];

  if (source === undefined || inputQuality === null) {
    return null;
  }

  return inputQuality.results.find((result) => result.source === source)?.status ?? null;
}

function backtestReason(status: SignalContributionStatus): SignalReviewReason {
  switch (status) {
    case "helpful":
      return "backtest-helpful";
    case "harmful":
      return "backtest-harmful";
    case "mixed":
    case "neutral":
      return "backtest-mixed";
    case "not-used":
      return "signal-not-used";
    default:
      return "backtest-missing";
  }
}

function forwardReason(status: SignalForwardStatus): SignalReviewReason {
  switch (status) {
    case "improved":
      return "forward-helpful";
    case "worsened":
      return "forward-harmful";
    case "mixed":
      return "forward-mixed";
    case "validating":
      return "forward-incomplete";
    default:
      return "insufficient-usable-samples";
  }
}

/**
 * 이미 계산된 백테스트 기여도와 Forward 실전 결과를 조합해 운영 검토 상태만 만든다.
 * 새 threshold를 만들지 않고, 어떤 신호도 자동으로 끄지 않는다.
 */
export function resolveSignalReviewStatus(
  backtest: SignalContributionStatus | null,
  forward: SignalForwardStatus | null,
): SignalReviewStatus {
  if (backtest === "not-used" || backtest === "not-separable") {
    return "undecided";
  }

  if (
    backtest === null ||
    forward === null ||
    forward === "validating" ||
    forward === "insufficient-sample" ||
    backtest === "insufficient-sample"
  ) {
    return "undecided";
  }

  if (backtest === "helpful" && forward === "improved") {
    return "keep";
  }

  return backtest === "harmful" && forward === "worsened" ? "review-removal" : "watch";
}

export interface BuildSignalReviewInput {
  contribution: ForecastSignalContribution | null;
  forwardValidation: SignalForwardValidation | null;
  inputQuality: ForecastInputQuality | null;
}

export function buildSignalReview({
  contribution,
  forwardValidation,
  inputQuality,
}: BuildSignalReviewInput): SignalReviewDecision[] {
  if (contribution === null) {
    return [];
  }

  const forwardBySignal = new Map<ForecastSignalKey, SignalForwardSummary>(
    summarizeSignalForwardValidation(forwardValidation).map((summary) => [summary.signal, summary]),
  );

  return contribution.signals.flatMap((signal) => {
    if (signal.status === "not-separable") {
      return [];
    }

    const forward = forwardBySignal.get(signal.signal) ?? null;
    const dataQualityStatus = readDataQualityStatus(inputQuality, signal.signal);
    const status = resolveSignalReviewStatus(signal.status, forward?.status ?? null);
    const reasons: SignalReviewReason[] = [
      backtestReason(signal.status),
      ...(forward === null ? (["forward-incomplete"] as const) : [forwardReason(forward.status)]),
      // 데이터가 없어 신호가 쓰이지 못한 상황을 성능 악화로 읽지 않도록 별도 사유로 남긴다.
      ...(dataQualityStatus === null || dataQualityStatus === "healthy" || dataQualityStatus === "duplicate"
        ? []
        : (["data-quality-degraded"] as const)),
    ];

    return [
      {
        signal: signal.signal,
        status,
        backtestVerdict: signal.status,
        forwardVerdict: forward?.status ?? null,
        forwardSampleCount: forward?.completedSampleCount ?? 0,
        forwardRequiredSampleCount: forward?.requiredSampleCount ?? 0,
        dataQualityStatus,
        reasons,
      },
    ];
  });
}
