import { rebuildCandidateBacktest } from "./candidate-backtest";
import {
  DAILY_SIGNAL_LOOKBACK_OBSERVATIONS,
  DAILY_SIGNAL_WEIGHT_CANDIDATES,
  type ForecastDailySignalParams,
  type ForecastModelParams,
} from "./forecast-model-config";
import {
  resolveForecastDirection,
  type RunWalkForwardBacktestResult,
  type WalkForwardEvaluationPoint,
} from "./run-walk-forward-backtest";
import type { ForecastDailyPriceRow } from "./types";

export interface DailyObservation {
  priceDate: Date;
  priceKrwPerL: number;
}

function toDateKey(value: Date): string | null {
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

/**
 * 기준 시각까지 확정된 유효 일별 관측치만 오름차순으로 정리한다.
 * 같은 날짜가 여러 번 있으면 마지막(=최신 확정) 값만 남긴다.
 */
export function selectValidDailyObservations(
  dailyPrices: readonly ForecastDailyPriceRow[],
  asOf: Date,
): DailyObservation[] {
  const asOfTime = asOf.getTime();
  const byDate = new Map<string, DailyObservation>();

  for (const row of dailyPrices) {
    const dateKey = toDateKey(row.priceDate);
    const price = row.observedPriceKrwPerL;

    if (
      dateKey === null ||
      row.priceDate.getTime() > asOfTime ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      continue;
    }

    byDate.set(dateKey, { priceDate: row.priceDate, priceKrwPerL: price });
  }

  return [...byDate.values()].sort(
    (left, right) => left.priceDate.getTime() - right.priceDate.getTime(),
  );
}

/** 달력상 N일이 아니라 실제로 존재하는 최근 N개 관측치를 사용한다. */
export function selectRecentDailyObservations(
  dailyPrices: readonly ForecastDailyPriceRow[],
  asOf: Date,
  lookbackObservations: number = DAILY_SIGNAL_LOOKBACK_OBSERVATIONS,
): DailyObservation[] {
  const valid = selectValidDailyObservations(dailyPrices, asOf);

  return valid.length < lookbackObservations ? [] : valid.slice(-lookbackObservations);
}

/** 중간 등락은 보지 않고 구간 처음 대비 마지막 값의 변화율만 사용한다. */
export function calculateDailyTrendRatio(
  observations: readonly DailyObservation[],
): number | null {
  if (observations.length < 2) {
    return null;
  }

  const first = observations[0].priceKrwPerL;
  const latest = observations[observations.length - 1].priceKrwPerL;

  return first <= 0 ? null : latest / first - 1;
}

export interface DailySignalState {
  observationCount: number;
  sufficient: boolean;
  startDate: Date | null;
  endDate: Date | null;
  firstPriceKrwPerL: number | null;
  latestPriceKrwPerL: number | null;
  trendRatio: number | null;
}

/** 관리자 화면과 후보 생성이 같은 기준을 쓰도록 현재 단기 방향을 요약한다. */
export function summarizeDailySignalState(
  dailyPrices: readonly ForecastDailyPriceRow[],
  asOf: Date,
  lookbackObservations: number = DAILY_SIGNAL_LOOKBACK_OBSERVATIONS,
): DailySignalState {
  const observations = selectRecentDailyObservations(dailyPrices, asOf, lookbackObservations);

  if (observations.length === 0) {
    return {
      observationCount: selectValidDailyObservations(dailyPrices, asOf).length,
      sufficient: false,
      startDate: null,
      endDate: null,
      firstPriceKrwPerL: null,
      latestPriceKrwPerL: null,
      trendRatio: null,
    };
  }

  return {
    observationCount: observations.length,
    sufficient: true,
    startDate: observations[0].priceDate,
    endDate: observations[observations.length - 1].priceDate,
    firstPriceKrwPerL: observations[0].priceKrwPerL,
    latestPriceKrwPerL: observations[observations.length - 1].priceKrwPerL,
    trendRatio: calculateDailyTrendRatio(observations),
  };
}

/**
 * 각 origin 시점 이전에 확정된 일별 데이터만으로 그 시점의 단기 방향을 다시 계산한다.
 * 최신 5일 추세를 과거 전체에 소급 적용하지 않으므로 미래 데이터 누수가 없다.
 */
export function applyDailySignal(
  oneStepPoints: readonly WalkForwardEvaluationPoint[],
  dailyPrices: readonly ForecastDailyPriceRow[],
  signal: ForecastDailySignalParams,
): WalkForwardEvaluationPoint[] {
  return oneStepPoints
    .filter((point) => point.horizonIndex === 1)
    .map((point) => {
      const observations = selectRecentDailyObservations(
        dailyPrices,
        point.originWeekEndDate,
        signal.lookbackObservations,
      );
      const trendRatio = calculateDailyTrendRatio(observations);

      if (trendRatio === null) {
        return point;
      }

      const forecastKrwPerL = point.forecastKrwPerL * (1 + trendRatio * signal.weight);
      const absoluteErrorKrwPerL = Math.abs(forecastKrwPerL - point.actualKrwPerL);

      return {
        ...point,
        forecastKrwPerL,
        absoluteErrorKrwPerL,
        absolutePercentageErrorPct:
          point.actualKrwPerL === 0 ? null : (absoluteErrorKrwPerL / point.actualKrwPerL) * 100,
        forecastDirection: resolveForecastDirection(point.anchorKrwPerL, forecastKrwPerL),
      };
    });
}

export interface BuildDailySignalBacktestInput {
  base: RunWalkForwardBacktestResult;
  dailyPrices: readonly ForecastDailyPriceRow[];
  signal: ForecastDailySignalParams;
  recentWindowWeeks: number;
  longWindowWeeks: number;
}

export function buildDailySignalBacktest({
  base,
  dailyPrices,
  signal,
  recentWindowWeeks,
  longWindowWeeks,
}: BuildDailySignalBacktestInput): RunWalkForwardBacktestResult {
  return rebuildCandidateBacktest({
    base,
    params: { ...base.params, dailySignal: signal },
    oneStepPoints: applyDailySignal(base.oneStepPoints, dailyPrices, signal),
    recentWindowWeeks,
    longWindowWeeks,
  });
}

export interface DailySignalCandidateParams {
  label: string;
  params: ForecastModelParams;
}

/** 첫 버전은 미사용(현재 설정)과 최근 5개 관측치 × 25%/50%만 비교한다. */
export function buildDailySignalCandidateParams(
  currentParams: ForecastModelParams,
): DailySignalCandidateParams[] {
  return [
    { label: "미사용", params: { ...currentParams, dailySignal: null } },
    ...DAILY_SIGNAL_WEIGHT_CANDIDATES.map((weight) => ({
      label: `최근 ${DAILY_SIGNAL_LOOKBACK_OBSERVATIONS}개 · ${(weight * 100).toFixed(0)}%`,
      params: {
        ...currentParams,
        dailySignal: {
          lookbackObservations: DAILY_SIGNAL_LOOKBACK_OBSERVATIONS,
          weight,
        },
      },
    })),
  ];
}

export function describeDailySignal(signal: ForecastDailySignalParams | null): string {
  return signal === null
    ? "미사용"
    : `최근 ${signal.lookbackObservations}개 × ${(signal.weight * 100).toFixed(0)}%`;
}
