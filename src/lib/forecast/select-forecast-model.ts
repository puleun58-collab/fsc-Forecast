import type { ForecastIndicatorWeeklySeries } from "./build-weekly-forecast";
import {
  DUBAI_LAG_WEEK_CANDIDATES,
  DUBAI_WEIGHT_CANDIDATES,
  EXTERNAL_ADJUSTMENT_CAP_CANDIDATES,
  PROMOTION_COOLDOWN_DAYS,
  PROMOTION_LONG_WINDOW_TOLERANCE_RATIO,
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_MIN_SAMPLE_COUNT,
  PROMOTION_VOLATILITY_TOLERANCE_RATIO,
  USD_KRW_LAG_WEEK_CANDIDATES,
  USD_KRW_WEIGHT_CANDIDATES,
  WEEKLY_TREND_LOOKBACK_WEEKS,
  type ForecastModelId,
  type ForecastModelParams,
} from "./forecast-model-config";
import {
  runWalkForwardBacktest,
  type RunWalkForwardBacktestResult,
} from "./run-walk-forward-backtest";
import { evaluatePromotionQuality } from "./promotion-quality";
import type { ForecastSeriesPoint } from "./types";

const DAY_MS = 86_400_000;

export interface ForecastModelCandidateSummary {
  modelId: ForecastModelId;
  params: ForecastModelParams;
  recentSampleCount: number;
  recentMaeKrwPerL: number | null;
  recentMapePct: number | null;
  longMaeKrwPerL: number | null;
  longMapePct: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  forecastChurnKrwPerL: number | null;
}

export interface SelectForecastModelInput {
  weeklySeries: readonly ForecastSeriesPoint[];
  indicatorSeries: ForecastIndicatorWeeklySeries;
  horizonCount: number;
  currentParams: ForecastModelParams;
  currentPromotedAt: Date | null;
  now: Date;
}

export interface SelectForecastModelResult {
  selectedParams: ForecastModelParams;
  selectedBacktest: RunWalkForwardBacktestResult;
  currentBacktest: RunWalkForwardBacktestResult;
  bestCandidate: ForecastModelCandidateSummary | null;
  promoted: boolean;
  promotionReason: string;
  maeImprovementRatio: number | null;
  mapeImprovementPctPoint: number | null;
  bestByModelId: Record<ForecastModelId, ForecastModelCandidateSummary | null>;
  /** 진단용: 모델별 최고 후보의 walk-forward 결과. 선택 로직에는 사용하지 않는다. */
  bestBacktestByModelId: Record<ForecastModelId, RunWalkForwardBacktestResult | null>;
  /** 진단용: 이번 실행에서 평가한 모든 후보 결과. 재계산을 피하려고 그대로 넘긴다. */
  candidateBacktests: RunWalkForwardBacktestResult[];
  evaluatedCandidateCount: number;
}

export function buildForecastModelCandidates(
  fallbackCapRatio: number,
): ForecastModelParams[] {
  const candidates: ForecastModelParams[] = [
    {
      modelId: "A",
      trendLookbackWeeks: WEEKLY_TREND_LOOKBACK_WEEKS,
      dubai: null,
      usdKrw: null,
      externalAdjustmentCapRatio: fallbackCapRatio,
    },
  ];

  for (const dubaiLagWeeks of DUBAI_LAG_WEEK_CANDIDATES) {
    for (const dubaiWeight of DUBAI_WEIGHT_CANDIDATES) {
      if (dubaiWeight === 0) {
        continue;
      }

      for (const capRatio of EXTERNAL_ADJUSTMENT_CAP_CANDIDATES) {
        candidates.push({
          modelId: "B",
          trendLookbackWeeks: WEEKLY_TREND_LOOKBACK_WEEKS,
          dubai: { lagWeeks: dubaiLagWeeks, weight: dubaiWeight },
          usdKrw: null,
          externalAdjustmentCapRatio: capRatio,
        });

        for (const usdKrwLagWeeks of USD_KRW_LAG_WEEK_CANDIDATES) {
          for (const usdKrwWeight of USD_KRW_WEIGHT_CANDIDATES) {
            if (usdKrwWeight === 0) {
              continue;
            }

            candidates.push({
              modelId: "C",
              trendLookbackWeeks: WEEKLY_TREND_LOOKBACK_WEEKS,
              dubai: { lagWeeks: dubaiLagWeeks, weight: dubaiWeight },
              usdKrw: { lagWeeks: usdKrwLagWeeks, weight: usdKrwWeight },
              externalAdjustmentCapRatio: capRatio,
            });
          }
        }
      }
    }
  }

  return candidates;
}

function summarizeCandidate(result: RunWalkForwardBacktestResult): ForecastModelCandidateSummary {
  return {
    modelId: result.params.modelId,
    params: result.params,
    recentSampleCount: result.recent.sampleCount,
    recentMaeKrwPerL: result.recent.maeKrwPerL,
    recentMapePct: result.recent.mapePct,
    longMaeKrwPerL: result.long.maeKrwPerL,
    longMapePct: result.long.mapePct,
    maxAbsoluteErrorKrwPerL: result.recent.maxAbsoluteErrorKrwPerL,
    forecastChurnKrwPerL: result.recent.forecastChurnKrwPerL,
  };
}

function isSameParams(left: ForecastModelParams, right: ForecastModelParams): boolean {
  return (
    left.modelId === right.modelId &&
    left.trendLookbackWeeks === right.trendLookbackWeeks &&
    left.externalAdjustmentCapRatio === right.externalAdjustmentCapRatio &&
    left.dubai?.lagWeeks === right.dubai?.lagWeeks &&
    left.dubai?.weight === right.dubai?.weight &&
    left.usdKrw?.lagWeeks === right.usdKrw?.lagWeeks &&
    left.usdKrw?.weight === right.usdKrw?.weight
  );
}

export function selectForecastModel(input: SelectForecastModelInput): SelectForecastModelResult {
  const currentBacktest = runWalkForwardBacktest({
    weeklySeries: input.weeklySeries,
    indicatorSeries: input.indicatorSeries,
    params: input.currentParams,
    horizonCount: input.horizonCount,
  });
  const candidates = buildForecastModelCandidates(input.currentParams.externalAdjustmentCapRatio);
  const results = candidates.map((params) =>
    runWalkForwardBacktest({
      weeklySeries: input.weeklySeries,
      indicatorSeries: input.indicatorSeries,
      params,
      horizonCount: input.horizonCount,
    }),
  );
  const bestByModelId: Record<ForecastModelId, ForecastModelCandidateSummary | null> = {
    A: null,
    B: null,
    C: null,
  };
  const bestBacktestByModelId: Record<ForecastModelId, RunWalkForwardBacktestResult | null> = {
    A: null,
    B: null,
    C: null,
  };
  const eligible: RunWalkForwardBacktestResult[] = [];

  for (const result of results) {
    if (result.recent.maeKrwPerL === null) {
      continue;
    }

    const summary = summarizeCandidate(result);
    const incumbent = bestByModelId[summary.modelId];

    if (
      incumbent === null ||
      (summary.recentMaeKrwPerL ?? Number.POSITIVE_INFINITY) <
        (incumbent.recentMaeKrwPerL ?? Number.POSITIVE_INFINITY)
    ) {
      bestByModelId[summary.modelId] = summary;
      bestBacktestByModelId[summary.modelId] = result;
    }

    if (result.recent.sampleCount >= PROMOTION_MIN_SAMPLE_COUNT) {
      eligible.push(result);
    }
  }

  const modelALongMae = bestByModelId.A?.longMaeKrwPerL ?? null;
  const stable = eligible.filter((result) => {
    if (result.params.modelId === "A" || modelALongMae === null || result.long.maeKrwPerL === null) {
      return true;
    }

    return result.long.maeKrwPerL <= modelALongMae * PROMOTION_LONG_WINDOW_TOLERANCE_RATIO;
  });
  const ranked = [...stable].sort((left, right) => {
    const maeDiff =
      (left.recent.maeKrwPerL ?? Number.POSITIVE_INFINITY) -
      (right.recent.maeKrwPerL ?? Number.POSITIVE_INFINITY);

    if (maeDiff !== 0) {
      return maeDiff;
    }

    return (
      (left.recent.mapePct ?? Number.POSITIVE_INFINITY) -
      (right.recent.mapePct ?? Number.POSITIVE_INFINITY)
    );
  });
  const best = ranked[0] ?? null;
  const keptResult: SelectForecastModelResult = {
    selectedParams: input.currentParams,
    selectedBacktest: currentBacktest,
    currentBacktest,
    bestCandidate: best === null ? null : summarizeCandidate(best),
    promoted: false,
    promotionReason: "kept_current_model",
    maeImprovementRatio: null,
    mapeImprovementPctPoint: null,
    bestByModelId,
    bestBacktestByModelId,
    candidateBacktests: results,
    evaluatedCandidateCount: results.length,
  };

  if (best === null) {
    return { ...keptResult, promotionReason: "kept_current_model_no_eligible_candidate" };
  }

  if (isSameParams(best.params, input.currentParams)) {
    return {
      ...keptResult,
      selectedBacktest: best,
      promotionReason: "kept_current_model_already_best",
    };
  }

  const currentMae = currentBacktest.recent.maeKrwPerL;
  const currentMape = currentBacktest.recent.mapePct;
  const bestMae = best.recent.maeKrwPerL;
  const bestMape = best.recent.mapePct;

  if (currentMae === null || bestMae === null) {
    return {
      selectedParams: best.params,
      selectedBacktest: best,
      currentBacktest,
      bestCandidate: summarizeCandidate(best),
      promoted: true,
      promotionReason: "promoted_bootstrap_no_current_metrics",
      maeImprovementRatio: null,
      mapeImprovementPctPoint: null,
      bestByModelId,
      bestBacktestByModelId,
      candidateBacktests: results,
      evaluatedCandidateCount: results.length,
    };
  }

  const quality = evaluatePromotionQuality(currentBacktest, best);
  const maeImprovementRatio = quality.maeImprovementRatio;
  const mapeImprovementPctPoint = quality.mapeImprovementPctPoint;
  const cooldownElapsed =
    input.currentPromotedAt === null ||
    input.now.getTime() - input.currentPromotedAt.getTime() >= PROMOTION_COOLDOWN_DAYS * DAY_MS;
  const meetsMinimumImprovement = quality.meetsMinimumImprovement;
  const longStable = quality.longStable;
  const maxErrorStable = quality.maxErrorStable;
  const churnStable = quality.churnStable;
  const rejectionReason = !cooldownElapsed
    ? "kept_current_model_promotion_cooldown"
    : !meetsMinimumImprovement
      ? "kept_current_model_improvement_below_minimum"
      : !longStable
        ? "kept_current_model_long_window_degraded"
        : !maxErrorStable
          ? "kept_current_model_max_error_increased"
          : !churnStable
            ? "kept_current_model_forecast_volatility_increased"
            : null;

  if (rejectionReason !== null) {
    return {
      ...keptResult,
      promotionReason: rejectionReason,
      maeImprovementRatio,
      mapeImprovementPctPoint,
    };
  }

  return {
    selectedParams: best.params,
    selectedBacktest: best,
    currentBacktest,
    bestCandidate: summarizeCandidate(best),
    promoted: true,
    promotionReason: "promoted_recent_improvement_with_long_stability",
    maeImprovementRatio,
    mapeImprovementPctPoint,
    bestByModelId,
    bestBacktestByModelId,
    candidateBacktests: results,
    evaluatedCandidateCount: results.length,
  };
}
