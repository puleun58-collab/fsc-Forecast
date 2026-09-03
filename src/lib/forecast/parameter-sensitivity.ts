import { z } from "zod";

import {
  ForecastModelParamsSchema,
  DUBAI_LAG_WEEK_CANDIDATES,
  DUBAI_WEIGHT_CANDIDATES,
  EXTERNAL_ADJUSTMENT_CAP_CANDIDATES,
  PROMOTION_MIN_SAMPLE_COUNT,
  USD_KRW_LAG_WEEK_CANDIDATES,
  USD_KRW_WEIGHT_CANDIDATES,
  type ForecastModelParams,
} from "./forecast-model-config";
import {
  evaluateTuningCandidateQuality,
  type PromotionQualityChecks,
} from "./promotion-quality";
import type { RunWalkForwardBacktestResult } from "./run-walk-forward-backtest";
import {
  BIAS_CANDIDATE_WINDOW_WEEKS,
  buildBiasCandidateParams,
  describeBiasCorrection,
  summarizeBiasState,
} from "./bias-correction";
import {
  createCandidateEvaluator,
  serializeSensitivityParamsKey,
} from "./candidate-backtest";
import {
  buildDailySignalCandidateParams,
  describeDailySignal,
  summarizeDailySignalState,
} from "./daily-signal";
import type { ForecastDailyPriceRow } from "./types";

/** 진단 전용 Trend 후보. 운영 candidate 탐색 범위에는 연결하지 않는다. */
export const DIAGNOSTIC_TREND_LOOKBACK_CANDIDATES = [4, 6, 8, 10, 12] as const;
export const PARAMETER_SENSITIVITY_VERSION = 3;
export const TUNING_CANDIDATE_LIMIT = 3;

export type ParameterSensitivityGroupKey =
  | "trendLookback"
  | "dubai"
  | "usdKrw"
  | "cap"
  | "bias"
  | "dailySignal";

export interface SensitivityWindowMetrics {
  sampleCount: number;
  maeKrwPerL: number | null;
  mapePct: number | null;
  maxAbsoluteErrorKrwPerL: number | null;
  directionAccuracyRatio: number | null;
  forecastChurnKrwPerL: number | null;
}

export interface SensitivityCandidate {
  label: string;
  params: ForecastModelParams;
  isCurrent: boolean;
  recentOneStep: SensitivityWindowMetrics;
  longOneStep: SensitivityWindowMetrics;
  qualityChecks: PromotionQualityChecks | null;
}

export interface ParameterSensitivityGroup {
  key: ParameterSensitivityGroupKey;
  status: "evaluated" | "not-applicable";
  notApplicableReason: string | null;
  candidates: SensitivityCandidate[];
}

export type TuningCandidateKind = "single" | "combination";

export interface TuningCandidate {
  label: string;
  groupKey: ParameterSensitivityGroupKey;
  kind: TuningCandidateKind;
  factorKeys: ParameterSensitivityGroupKey[];
  params: ForecastModelParams;
  recentOneStep: SensitivityWindowMetrics;
  longOneStep: SensitivityWindowMetrics;
  qualityChecks: PromotionQualityChecks;
  meetsPromotionQuality: boolean;
}

export interface CombinationSeed {
  groupKey: ParameterSensitivityGroupKey;
  label: string;
  params: ForecastModelParams;
  recentOneStep: SensitivityWindowMetrics;
  longOneStep: SensitivityWindowMetrics;
  qualityChecks: PromotionQualityChecks;
}

export interface CombinationCandidate {
  label: string;
  factorKeys: ParameterSensitivityGroupKey[];
  params: ForecastModelParams;
  recentOneStep: SensitivityWindowMetrics;
  longOneStep: SensitivityWindowMetrics;
  qualityChecks: PromotionQualityChecks;
  meetsPromotionQuality: boolean;
}

export interface CombinationAnalysis {
  status: "evaluated" | "insufficient-seeds" | "not-applicable";
  seeds: CombinationSeed[];
  candidates: CombinationCandidate[];
  evaluatedCandidateCount: number;
}

/** 재현을 위해 후보 평가에 사용한 일별 관측 구간을 그대로 남긴다. */
export interface DailySignalDiagnostics {
  observationCount: number;
  sufficient: boolean;
  startDate: string | null;
  endDate: string | null;
  firstPriceKrwPerL: number | null;
  latestPriceKrwPerL: number | null;
  trendRatio: number | null;
}

export interface ParameterSensitivity {
  version: number;
  evaluatedAt: string;
  /** 후보 품질 판정에 사용한 성능 구간. v1/v2 metadata는 full-horizon이다. */
  qualityBasis: "full-horizon" | "one-step";
  currentParams: ForecastModelParams;
  currentRecentOneStep: SensitivityWindowMetrics;
  currentLongOneStep: SensitivityWindowMetrics;
  sampleSufficient: boolean;
  groups: ParameterSensitivityGroup[];
  /** v1 metadata에는 존재하지 않는다. */
  combinationAnalysis: CombinationAnalysis | null;
  tuningCandidates: TuningCandidate[];
  /** v3 이전 metadata에는 없다. */
  dailySignal: DailySignalDiagnostics | null;
}

const WindowMetricsSchema = z.object({
  sampleCount: z.number(),
  maeKrwPerL: z.number().nullable(),
  mapePct: z.number().nullable(),
  maxAbsoluteErrorKrwPerL: z.number().nullable(),
  directionAccuracyRatio: z.number().nullable(),
  forecastChurnKrwPerL: z.number().nullable(),
});

const ModelParamsSchema = ForecastModelParamsSchema;

const QualityChecksSchema = z.object({
  maeImprovementRatio: z.number().nullable(),
  mapeImprovementPctPoint: z.number().nullable(),
  meetsMinimumImprovement: z.boolean(),
  longStable: z.boolean(),
  maxErrorStable: z.boolean(),
  churnStable: z.boolean(),
});

const GroupKeySchema = z.enum(["trendLookback", "dubai", "usdKrw", "cap", "bias", "dailySignal"]);

const SensitivityMetadataSchema = z.object({
  model: z.object({
    parameterSensitivity: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      /** v3부터 one-step 기준으로 후보 품질을 판정한다. 과거 run에는 없다. */
      qualityBasis: z.enum(["full-horizon", "one-step"]).default("full-horizon"),
      currentParams: ModelParamsSchema,
      currentRecentOneStep: WindowMetricsSchema,
      currentLongOneStep: WindowMetricsSchema,
      sampleSufficient: z.boolean(),
      groups: z.array(
        z.object({
          key: GroupKeySchema,
          status: z.enum(["evaluated", "not-applicable"]),
          notApplicableReason: z.string().nullable(),
          candidates: z.array(
            z.object({
              label: z.string(),
              params: ModelParamsSchema,
              isCurrent: z.boolean(),
              recentOneStep: WindowMetricsSchema,
              longOneStep: WindowMetricsSchema,
              qualityChecks: QualityChecksSchema.nullable(),
            }),
          ),
        }),
      ),
      // v1 metadata에는 조합 분석 필드가 없으므로 없으면 null로 정규화한다.
      combinationAnalysis: z
        .object({
          status: z.enum(["evaluated", "insufficient-seeds", "not-applicable"]),
          seeds: z.array(
            z.object({
              groupKey: GroupKeySchema,
              label: z.string(),
              params: ModelParamsSchema,
              recentOneStep: WindowMetricsSchema,
              longOneStep: WindowMetricsSchema,
              qualityChecks: QualityChecksSchema,
            }),
          ),
          candidates: z.array(
            z.object({
              label: z.string(),
              factorKeys: z.array(GroupKeySchema),
              params: ModelParamsSchema,
              recentOneStep: WindowMetricsSchema,
              longOneStep: WindowMetricsSchema,
              qualityChecks: QualityChecksSchema,
              meetsPromotionQuality: z.boolean(),
            }),
          ),
          evaluatedCandidateCount: z.number(),
        })
        .nullish()
        .transform((value) => value ?? null),
      tuningCandidates: z.array(
        z
          .object({
            label: z.string(),
            groupKey: GroupKeySchema,
            kind: z.enum(["single", "combination"]).nullish(),
            factorKeys: z.array(GroupKeySchema).nullish(),
            params: ModelParamsSchema,
            recentOneStep: WindowMetricsSchema,
            longOneStep: WindowMetricsSchema,
            qualityChecks: QualityChecksSchema,
            meetsPromotionQuality: z.boolean(),
          })
          .transform((candidate) => ({
            ...candidate,
            kind: candidate.kind ?? ("single" as TuningCandidateKind),
            factorKeys: candidate.factorKeys ?? [candidate.groupKey],
          })),
      ),
      dailySignal: z
        .object({
          observationCount: z.number(),
          sufficient: z.boolean(),
          startDate: z.string().nullable(),
          endDate: z.string().nullable(),
          firstPriceKrwPerL: z.number().nullable(),
          latestPriceKrwPerL: z.number().nullable(),
          trendRatio: z.number().nullable(),
        })
        .nullish()
        .transform((value) => value ?? null),
    }),
  }),
});

function toWindowMetrics(
  metrics: RunWalkForwardBacktestResult["recentOneStep"],
): SensitivityWindowMetrics {
  return {
    sampleCount: metrics.sampleCount,
    maeKrwPerL: metrics.maeKrwPerL,
    mapePct: metrics.mapePct,
    maxAbsoluteErrorKrwPerL: metrics.maxAbsoluteErrorKrwPerL,
    directionAccuracyRatio: metrics.directionAccuracyRatio,
    forecastChurnKrwPerL: metrics.forecastChurnKrwPerL,
  };
}

export { serializeSensitivityParamsKey };

/** 관리자 화면 표기는 lag/weight 대신 뜻이 드러나는 한국어를 쓴다. */
export function describeIndicator(indicator: ForecastModelParams["dubai"]): string {
  return indicator === null
    ? "미사용"
    : `반영 시차 ${indicator.lagWeeks}주 · 반영 비중 ${formatWeightPercent(indicator.weight)}`;
}

function formatWeightPercent(weight: number): string {
  return `${Number((weight * 100).toFixed(1))}%`;
}

function resolveModelId(params: ForecastModelParams): ForecastModelParams["modelId"] {
  if (params.usdKrw !== null) {
    return "C";
  }

  return params.dubai === null ? "A" : "B";
}

function withParams(base: ForecastModelParams, overrides: Partial<ForecastModelParams>): ForecastModelParams {
  const merged = { ...base, ...overrides };
  return { ...merged, modelId: resolveModelId(merged) };
}

const FACTOR_KEYS: readonly ParameterSensitivityGroupKey[] = [
  "trendLookback",
  "dubai",
  "usdKrw",
  "cap",
  "bias",
  "dailySignal",
];

function describeFactorValue(
  factorKey: ParameterSensitivityGroupKey,
  params: ForecastModelParams,
): string {
  switch (factorKey) {
    case "trendLookback":
      return `Trend ${params.trendLookbackWeeks}주`;
    case "dubai":
      return `Dubai ${describeIndicator(params.dubai)}`;
    case "usdKrw":
      return `USD/KRW ${describeIndicator(params.usdKrw)}`;
    case "cap":
      return `Cap ±${(params.externalAdjustmentCapRatio * 100).toFixed(0)}%`;
    case "bias":
      return `Bias ${describeBiasCorrection(params.biasCorrection)}`;
    case "dailySignal":
      return `일별 단기 신호 ${describeDailySignal(params.dailySignal)}`;
  }
}

/** 의미 단위로 실제 달라진 항목만 센다. modelId는 파생값이라 세지 않는다. */
function diffFactorKeys(
  currentParams: ForecastModelParams,
  candidateParams: ForecastModelParams,
): ParameterSensitivityGroupKey[] {
  return FACTOR_KEYS.filter(
    (factorKey) =>
      describeFactorValue(factorKey, currentParams) !== describeFactorValue(factorKey, candidateParams),
  );
}

function applyFactor(
  base: ForecastModelParams,
  factorKey: ParameterSensitivityGroupKey,
  source: ForecastModelParams,
): ForecastModelParams {
  switch (factorKey) {
    case "trendLookback":
      return withParams(base, { trendLookbackWeeks: source.trendLookbackWeeks });
    case "dubai":
      return withParams(base, { dubai: source.dubai });
    case "usdKrw":
      return withParams(base, { usdKrw: source.usdKrw });
    case "cap":
      return withParams(base, { externalAdjustmentCapRatio: source.externalAdjustmentCapRatio });
    case "bias":
      return withParams(base, { biasCorrection: source.biasCorrection });
    case "dailySignal":
      return withParams(base, { dailySignal: source.dailySignal });
  }
}

function meetsAllPromotionChecks(checks: PromotionQualityChecks): boolean {
  return (
    checks.meetsMinimumImprovement && checks.longStable && checks.maxErrorStable && checks.churnStable
  );
}

/** 최근 성능 우선, 동률이면 결정적 params key 순서로 정렬한다. */
function compareByPerformance(
  left: { recentOneStep: SensitivityWindowMetrics; longOneStep: SensitivityWindowMetrics; params: ForecastModelParams },
  right: { recentOneStep: SensitivityWindowMetrics; longOneStep: SensitivityWindowMetrics; params: ForecastModelParams },
): number {
  const metrics: (keyof SensitivityWindowMetrics)[] = ["maeKrwPerL", "mapePct"];

  for (const metric of metrics) {
    const leftValue = left.recentOneStep[metric] ?? Number.POSITIVE_INFINITY;
    const rightValue = right.recentOneStep[metric] ?? Number.POSITIVE_INFINITY;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  const leftLongMae = left.longOneStep.maeKrwPerL ?? Number.POSITIVE_INFINITY;
  const rightLongMae = right.longOneStep.maeKrwPerL ?? Number.POSITIVE_INFINITY;

  if (leftLongMae !== rightLongMae) {
    return leftLongMae - rightLongMae;
  }

  return serializeSensitivityParamsKey(left.params).localeCompare(
    serializeSensitivityParamsKey(right.params),
  );
}

function buildGroupParams(
  currentParams: ForecastModelParams,
): Record<ParameterSensitivityGroupKey, { label: string; params: ForecastModelParams }[]> {
  const trendLookback = DIAGNOSTIC_TREND_LOOKBACK_CANDIDATES.map((weeks) => ({
    label: `${weeks}주`,
    params: withParams(currentParams, { trendLookbackWeeks: weeks }),
  }));
  const dubaiWeights = DUBAI_WEIGHT_CANDIDATES.filter((weight) => weight > 0);
  const dubai = [
    { label: "미사용", params: withParams(currentParams, { dubai: null, usdKrw: null }) },
    ...DUBAI_LAG_WEEK_CANDIDATES.flatMap((lagWeeks) =>
      dubaiWeights.map((weight) => ({
        label: describeIndicator({ lagWeeks, weight }),
        params: withParams(currentParams, { dubai: { lagWeeks, weight } }),
      })),
    ),
  ];
  const usdKrwWeights = USD_KRW_WEIGHT_CANDIDATES.filter((weight) => weight > 0);
  const usdKrw = [
    { label: "미사용", params: withParams(currentParams, { usdKrw: null }) },
    ...USD_KRW_LAG_WEEK_CANDIDATES.flatMap((lagWeeks) =>
      usdKrwWeights.map((weight) => ({
        label: describeIndicator({ lagWeeks, weight }),
        params: withParams(currentParams, { usdKrw: { lagWeeks, weight } }),
      })),
    ),
  ];
  const cap = EXTERNAL_ADJUSTMENT_CAP_CANDIDATES.map((ratio) => ({
    label: `±${(ratio * 100).toFixed(0)}%`,
    params: withParams(currentParams, { externalAdjustmentCapRatio: ratio }),
  }));

  const bias = buildBiasCandidateParams(currentParams).map((candidate) => ({
    label: candidate.label,
    params: withParams(currentParams, { biasCorrection: candidate.params.biasCorrection }),
  }));
  const dailySignal = buildDailySignalCandidateParams(currentParams).map((candidate) => ({
    label: candidate.label,
    params: withParams(currentParams, { dailySignal: candidate.params.dailySignal }),
  }));

  return { trendLookback, dubai, usdKrw, cap, bias, dailySignal };
}

export interface BuildParameterSensitivityInput {
  currentParams: ForecastModelParams;
  currentBacktest: RunWalkForwardBacktestResult;
  /** 이미 평가된 후보를 재사용하고, 없을 때만 새 walk-forward를 실행한다. */
  evaluate: (params: ForecastModelParams) => RunWalkForwardBacktestResult | null;
  evaluatedAt: Date;
  /** 일별 단기 신호 후보 평가용. 파이프라인 시작 때 한 번 읽은 값을 그대로 넘긴다. */
  dailyPrices?: readonly ForecastDailyPriceRow[];
}

interface BuildCombinationAnalysisInput {
  currentParams: ForecastModelParams;
  currentBacktest: RunWalkForwardBacktestResult;
  currentKey: string;
  groups: readonly ParameterSensitivityGroup[];
  sampleSufficient: boolean;
  evaluate: (params: ForecastModelParams) => RunWalkForwardBacktestResult | null;
}

/**
 * 1단계에서 기존 품질 기준을 통과한 그룹별 최고 후보만 seed로 삼아
 * 서로 다른 항목 2개씩 최대 6조합만 추가 평가한다. 전체 조합 탐색은 하지 않는다.
 */
function buildCombinationAnalysis({
  currentParams,
  currentBacktest,
  currentKey,
  groups,
  sampleSufficient,
  evaluate,
}: BuildCombinationAnalysisInput): CombinationAnalysis {
  if (!sampleSufficient) {
    return { status: "not-applicable", seeds: [], candidates: [], evaluatedCandidateCount: 0 };
  }

  const seeds = groups.flatMap((group) => {
    const eligible = group.candidates.filter(
      (candidate) =>
        !candidate.isCurrent &&
        candidate.qualityChecks !== null &&
        meetsAllPromotionChecks(candidate.qualityChecks) &&
        // 구조적으로 두 항목이 함께 바뀌는 후보는 조합 seed로 쓰지 않는다.
        diffFactorKeys(currentParams, candidate.params).join("+") === group.key,
    );
    const best = [...eligible].sort(compareByPerformance)[0];

    return best === undefined || best.qualityChecks === null
      ? []
      : [
          {
            groupKey: group.key,
            label: best.label,
            params: best.params,
            recentOneStep: best.recentOneStep,
            longOneStep: best.longOneStep,
            qualityChecks: best.qualityChecks,
          },
        ];
  });

  if (seeds.length < 2) {
    return { status: "insufficient-seeds", seeds, candidates: [], evaluatedCandidateCount: 0 };
  }

  const seenKeys = new Set<string>([
    currentKey,
    ...seeds.map((seed) => serializeSensitivityParamsKey(seed.params)),
  ]);
  const candidates: CombinationCandidate[] = [];

  for (let left = 0; left < seeds.length; left += 1) {
    for (let right = left + 1; right < seeds.length; right += 1) {
      const first = seeds[left];
      const second = seeds[right];

      if (first === undefined || second === undefined) {
        continue;
      }

      const params = applyFactor(
        applyFactor(currentParams, first.groupKey, first.params),
        second.groupKey,
        second.params,
      );
      const key = serializeSensitivityParamsKey(params);
      const factorKeys = diffFactorKeys(currentParams, params);

      // 유효하지 않은 USD/KRW 단독 사용이나 중복·비2요소 조합은 평가하지 않는다.
      if (
        seenKeys.has(key) ||
        factorKeys.length !== 2 ||
        (params.usdKrw !== null && params.dubai === null)
      ) {
        continue;
      }

      seenKeys.add(key);
      const backtest = evaluate(params);

      if (backtest === null) {
        continue;
      }

      const qualityChecks = evaluateTuningCandidateQuality(currentBacktest, backtest);

      if (backtest.recentOneStep.sampleCount < PROMOTION_MIN_SAMPLE_COUNT) {
        continue;
      }

      candidates.push({
        label: `${describeFactorValue(first.groupKey, params)} + ${describeFactorValue(second.groupKey, params)}`,
        factorKeys,
        params,
        recentOneStep: toWindowMetrics(backtest.recentOneStep),
        longOneStep: toWindowMetrics(backtest.longOneStep),
        qualityChecks,
        meetsPromotionQuality: meetsAllPromotionChecks(qualityChecks),
      });
    }
  }

  return {
    status: "evaluated",
    seeds,
    candidates: [...candidates].sort(compareByPerformance),
    evaluatedCandidateCount: candidates.length,
  };
}

/**
 * one-factor-at-a-time 방식으로 파라미터 대안을 비교한다.
 * 운영 파라미터나 모델 선택 결과는 변경하지 않는 진단 전용 계산이다.
 */
export function buildParameterSensitivity({
  currentParams,
  currentBacktest,
  evaluate,
  evaluatedAt,
  dailyPrices = [],
}: BuildParameterSensitivityInput): ParameterSensitivity {
  // 같은 params는 1단계·2단계를 통틀어 한 번만 walk-forward를 실행한다.
  const evaluateCached = createCandidateEvaluator({
    evaluate,
    dailyPrices,
    recentWindowWeeks: currentBacktest.recentOneStep.windowWeeks,
    longWindowWeeks: currentBacktest.longOneStep.windowWeeks,
  });
  const currentKey = serializeSensitivityParamsKey(currentParams);
  const groupParams = buildGroupParams(currentParams);
  const usdKrwEvaluable = currentParams.dubai !== null || currentParams.usdKrw !== null;
  const biasState = summarizeBiasState(currentBacktest.oneStepPoints);
  const dailySignalState = summarizeDailySignalState(dailyPrices, evaluatedAt);
  const groups: ParameterSensitivityGroup[] = (
    [
      "trendLookback",
      "dubai",
      "usdKrw",
      "cap",
      "bias",
      "dailySignal",
    ] as ParameterSensitivityGroupKey[]
  ).map((key) => {
    if (key === "usdKrw" && !usdKrwEvaluable) {
      return {
        key,
        status: "not-applicable",
        notApplicableReason: "USD/KRW 민감도는 Dubai 보정을 사용하는 모델에서 평가할 수 있습니다.",
        candidates: [],
      };
    }

    if (key === "bias" && !biasState.persistent) {
      return {
        key,
        status: "not-applicable",
        notApplicableReason:
          biasState.sampleCount < BIAS_CANDIDATE_WINDOW_WEEKS
            ? "Bias 보정을 평가할 만큼 최근 예측 결과가 쌓이지 않았습니다."
            : "최근 예측이 한쪽 방향으로 치우쳐 있지 않아 Bias 보정 후보를 만들지 않습니다.",
        candidates: [],
      };
    }

    if (key === "dailySignal" && !dailySignalState.sufficient) {
      return {
        key,
        status: "not-applicable",
        notApplicableReason: `일별 데이터가 ${dailySignalState.observationCount}개뿐이라 일별 단기 신호 후보를 평가하지 않습니다.`,
        candidates: [],
      };
    }

    const candidates = groupParams[key].flatMap((candidate) => {
      const candidateKey = serializeSensitivityParamsKey(candidate.params);
      const isCurrent = candidateKey === currentKey;
      const backtest = isCurrent ? currentBacktest : evaluateCached(candidate.params);

      if (backtest === null) {
        return [];
      }

      return [
        {
          label: candidate.label,
          params: candidate.params,
          isCurrent,
          recentOneStep: toWindowMetrics(backtest.recentOneStep),
          longOneStep: toWindowMetrics(backtest.longOneStep),
          qualityChecks: isCurrent ? null : evaluateTuningCandidateQuality(currentBacktest, backtest),
        },
      ];
    });

    return { key, status: "evaluated" as const, notApplicableReason: null, candidates };
  });
  const sampleSufficient = currentBacktest.recentOneStep.sampleCount >= PROMOTION_MIN_SAMPLE_COUNT;
  const singleCandidates: TuningCandidate[] = !sampleSufficient
    ? []
    : groups.flatMap((group) =>
        group.candidates.flatMap((candidate) =>
          candidate.isCurrent ||
          candidate.qualityChecks === null ||
          candidate.recentOneStep.sampleCount < PROMOTION_MIN_SAMPLE_COUNT
            ? []
            : [
                {
                  label: candidate.label,
                  groupKey: group.key,
                  kind: "single" as const,
                  factorKeys: diffFactorKeys(currentParams, candidate.params),
                  params: candidate.params,
                  recentOneStep: candidate.recentOneStep,
                  longOneStep: candidate.longOneStep,
                  qualityChecks: candidate.qualityChecks,
                  meetsPromotionQuality: meetsAllPromotionChecks(candidate.qualityChecks),
                },
              ],
        ),
      );
  const combinationAnalysis = buildCombinationAnalysis({
    currentParams,
    currentBacktest,
    currentKey,
    groups,
    sampleSufficient,
    evaluate: evaluateCached,
  });
  const rankedByKey = new Map<string, TuningCandidate>();

  for (const candidate of [
    ...singleCandidates,
    ...combinationAnalysis.candidates.map((candidate) => ({
      label: candidate.label,
      groupKey: candidate.factorKeys[0] ?? "trendLookback",
      kind: "combination" as const,
      factorKeys: candidate.factorKeys,
      params: candidate.params,
      recentOneStep: candidate.recentOneStep,
      longOneStep: candidate.longOneStep,
      qualityChecks: candidate.qualityChecks,
      meetsPromotionQuality: candidate.meetsPromotionQuality,
    })),
  ]) {
    if (!candidate.meetsPromotionQuality) {
      continue;
    }

    const key = serializeSensitivityParamsKey(candidate.params);

    if (!rankedByKey.has(key)) {
      rankedByKey.set(key, candidate);
    }
  }

  const tuningCandidates = [...rankedByKey.values()]
    .sort(compareByPerformance)
    .slice(0, TUNING_CANDIDATE_LIMIT);

  return {
    version: PARAMETER_SENSITIVITY_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    qualityBasis: "one-step",
    currentParams,
    currentRecentOneStep: toWindowMetrics(currentBacktest.recentOneStep),
    currentLongOneStep: toWindowMetrics(currentBacktest.longOneStep),
    sampleSufficient,
    groups,
    combinationAnalysis,
    tuningCandidates,
    dailySignal: {
      observationCount: dailySignalState.observationCount,
      sufficient: dailySignalState.sufficient,
      startDate: dailySignalState.startDate?.toISOString() ?? null,
      endDate: dailySignalState.endDate?.toISOString() ?? null,
      firstPriceKrwPerL: dailySignalState.firstPriceKrwPerL,
      latestPriceKrwPerL: dailySignalState.latestPriceKrwPerL,
      trendRatio: dailySignalState.trendRatio,
    },
  };
}

export function readParameterSensitivity(metadata: unknown): ParameterSensitivity | null {
  const parsed = SensitivityMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.parameterSensitivity : null;
}
