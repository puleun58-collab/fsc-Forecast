import { z } from "zod";

import { LONG_EVALUATION_WEEKS } from "./forecast-model-config";
import type { ForecastModelParams } from "./forecast-model-config";
import {
  MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT,
  MARKET_REGIME_ORDER,
  buildMarketRegimeTimeline,
  type MarketRegime,
} from "./market-regime";
import { serializeSensitivityParamsKey, type TuningCandidateKind } from "./parameter-sensitivity";
import { summarizeWindow, type WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";
import { buildCandidateFingerprint } from "./shadow-validation";
import type { ForecastSeriesPoint } from "./types";

export const CANDIDATE_REGIME_COMPARISON_VERSION = 1;
/** 기존 품질 추이 화면과 같은 표시 정밀도로 비교해 미세 차이를 유사로 본다. */
export const CANDIDATE_REGIME_MAE_PRECISION = 2;

export type CandidateRegimeVerdict = "improved" | "similar" | "worsened" | "insufficient-sample";

export interface CandidateRegimeRow {
  regime: MarketRegime;
  sampleCount: number;
  currentMaeKrwPerL: number | null;
  candidateMaeKrwPerL: number | null;
  maeDeltaKrwPerL: number | null;
  currentMapePct: number | null;
  candidateMapePct: number | null;
  currentDirectionAccuracyRatio: number | null;
  candidateDirectionAccuracyRatio: number | null;
  verdict: CandidateRegimeVerdict;
}

export interface CandidateRegimeComparison {
  version: number;
  evaluatedAt: string;
  windowWeeks: number;
  label: string;
  kind: TuningCandidateKind;
  paramsKey: string;
  candidateFingerprint: string;
  comparedSampleCount: number;
  regimes: CandidateRegimeRow[];
  /** 현재 설정보다 오차가 가장 크게 늘어난 국면. 표본이 충분한 국면만 대상으로 한다. */
  weakestRegime: MarketRegime | null;
}

export interface CandidateRegimeInput {
  label: string;
  kind: TuningCandidateKind;
  params: ForecastModelParams;
  oneStepPoints: readonly WalkForwardEvaluationPoint[];
}

export interface BuildCandidateRegimeComparisonsInput {
  weeklySeries: readonly ForecastSeriesPoint[];
  currentOneStepPoints: readonly WalkForwardEvaluationPoint[];
  candidates: readonly CandidateRegimeInput[];
  modelVersion: string;
  evaluatedAt: Date;
  windowWeeks?: number;
}

function roundToDisplay(value: number | null): number | null {
  const factor = 10 ** CANDIDATE_REGIME_MAE_PRECISION;

  return value === null ? null : Math.round(value * factor) / factor;
}

function resolveVerdict(
  sampleCount: number,
  currentMae: number | null,
  candidateMae: number | null,
): CandidateRegimeVerdict {
  if (sampleCount < MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT) {
    return "insufficient-sample";
  }

  const current = roundToDisplay(currentMae);
  const candidate = roundToDisplay(candidateMae);

  if (current === null || candidate === null || current === candidate) {
    return "similar";
  }

  return candidate < current ? "improved" : "worsened";
}

/**
 * 현재 설정과 후보를 같은 시장 국면 timeline·같은 평가 주차에서만 비교한다.
 * 이미 계산된 one-step 결과만 사용하므로 walk-forward를 다시 실행하지 않는다.
 */
export function buildCandidateRegimeComparisons({
  weeklySeries,
  currentOneStepPoints,
  candidates,
  modelVersion,
  evaluatedAt,
  windowWeeks = LONG_EVALUATION_WEEKS,
}: BuildCandidateRegimeComparisonsInput): CandidateRegimeComparison[] {
  const timeline = buildMarketRegimeTimeline(weeklySeries);
  const regimeByOrigin = new Map<number, MarketRegime>(
    timeline.map((entry) => [entry.originWeekEndDate.getTime(), entry.regime]),
  );
  const currentByTarget = new Map<number, WalkForwardEvaluationPoint>(
    currentOneStepPoints
      .filter((point) => point.horizonIndex === 1)
      .map((point) => [point.targetDate.getTime(), point]),
  );

  return candidates.map((candidate) => {
    const pairs = candidate.oneStepPoints
      .filter((point) => point.horizonIndex === 1)
      .flatMap((candidatePoint) => {
        const currentPoint = currentByTarget.get(candidatePoint.targetDate.getTime());

        return currentPoint === undefined ? [] : [{ currentPoint, candidatePoint }];
      })
      .sort(
        (left, right) =>
          left.candidatePoint.targetDate.getTime() - right.candidatePoint.targetDate.getTime(),
      )
      .slice(-windowWeeks);
    const pairsByRegime: Record<MarketRegime, typeof pairs> = {
      stable: [],
      rising: [],
      falling: [],
      "high-volatility": [],
      unclassified: [],
    };

    for (const pair of pairs) {
      pairsByRegime[
        regimeByOrigin.get(pair.candidatePoint.originWeekEndDate.getTime()) ?? "unclassified"
      ].push(pair);
    }

    const regimes = MARKET_REGIME_ORDER.map((regime) => {
      const regimePairs = pairsByRegime[regime];
      const current = summarizeWindow(
        regimePairs.map((pair) => pair.currentPoint),
        windowWeeks,
        null,
      );
      const candidateMetrics = summarizeWindow(
        regimePairs.map((pair) => pair.candidatePoint),
        windowWeeks,
        null,
      );
      const maeDeltaKrwPerL =
        current.maeKrwPerL === null || candidateMetrics.maeKrwPerL === null
          ? null
          : roundToDisplay(candidateMetrics.maeKrwPerL - current.maeKrwPerL);

      return {
        regime,
        sampleCount: regimePairs.length,
        currentMaeKrwPerL: current.maeKrwPerL,
        candidateMaeKrwPerL: candidateMetrics.maeKrwPerL,
        maeDeltaKrwPerL,
        currentMapePct: current.mapePct,
        candidateMapePct: candidateMetrics.mapePct,
        currentDirectionAccuracyRatio: current.directionAccuracyRatio,
        candidateDirectionAccuracyRatio: candidateMetrics.directionAccuracyRatio,
        verdict: resolveVerdict(
          regimePairs.length,
          current.maeKrwPerL,
          candidateMetrics.maeKrwPerL,
        ),
      };
    });
    const weakest = regimes
      .filter((row) => row.verdict === "worsened")
      .reduce<CandidateRegimeRow | null>(
        (worst, row) =>
          worst === null || (row.maeDeltaKrwPerL ?? 0) > (worst.maeDeltaKrwPerL ?? 0) ? row : worst,
        null,
      );

    return {
      version: CANDIDATE_REGIME_COMPARISON_VERSION,
      evaluatedAt: evaluatedAt.toISOString(),
      windowWeeks,
      label: candidate.label,
      kind: candidate.kind,
      paramsKey: serializeSensitivityParamsKey(candidate.params),
      candidateFingerprint: buildCandidateFingerprint(candidate.params, modelVersion),
      comparedSampleCount: pairs.length,
      regimes,
      weakestRegime: weakest?.regime ?? null,
    };
  });
}

const RegimeSchema = z.enum(["stable", "rising", "falling", "high-volatility", "unclassified"]);

const ComparisonSchema = z.object({
  version: z.number(),
  evaluatedAt: z.string().datetime(),
  windowWeeks: z.number(),
  label: z.string(),
  kind: z.enum(["single", "combination"]),
  paramsKey: z.string(),
  candidateFingerprint: z.string(),
  comparedSampleCount: z.number(),
  regimes: z.array(
    z.object({
      regime: RegimeSchema,
      sampleCount: z.number(),
      currentMaeKrwPerL: z.number().finite().nullable(),
      candidateMaeKrwPerL: z.number().finite().nullable(),
      maeDeltaKrwPerL: z.number().finite().nullable(),
      currentMapePct: z.number().finite().nullable(),
      candidateMapePct: z.number().finite().nullable(),
      currentDirectionAccuracyRatio: z.number().finite().nullable(),
      candidateDirectionAccuracyRatio: z.number().finite().nullable(),
      verdict: z.enum(["improved", "similar", "worsened", "insufficient-sample"]),
    }),
  ),
  weakestRegime: RegimeSchema.nullable(),
});

const ComparisonMetadataSchema = z.object({
  model: z.object({ candidateRegimeComparisons: z.array(ComparisonSchema) }),
});

export function readCandidateRegimeComparisons(
  metadata: unknown,
): CandidateRegimeComparison[] | null {
  const parsed = ComparisonMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.candidateRegimeComparisons : null;
}
