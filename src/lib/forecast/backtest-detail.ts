import { z } from "zod";

import type { ForecastDirection, WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";

/** metadata에는 진단에 필요한 최근 구간만 남긴다. */
export const BACKTEST_DETAIL_STORED_LIMIT = 26;
export const BACKTEST_DETAIL_DISPLAY_LIMIT = 13;
const HIGHLIGHT_COUNT = 3;

export interface BacktestDetailPoint {
  targetDate: string;
  originWeekEndDate: string;
  anchorKrwPerL: number;
  actualKrwPerL: number;
  forecastKrwPerL: number;
  absoluteErrorKrwPerL: number;
  absolutePercentageErrorPct: number | null;
  actualDirection: ForecastDirection;
  forecastDirection: ForecastDirection;
}

export interface BacktestDetailRow extends BacktestDetailPoint {
  /** Forecast - Actual. 음수는 실제보다 낮게 예측했다는 뜻이다. */
  signedErrorKrwPerL: number;
  directionHit: boolean;
  highlighted: boolean;
}

export interface BacktestDetailSummary {
  sampleCount: number;
  maeKrwPerL: number;
  mapePct: number | null;
  directionHitCount: number;
  maxAbsoluteErrorKrwPerL: number;
}

export interface BacktestDetail {
  rows: BacktestDetailRow[];
  summary: BacktestDetailSummary | null;
}

const DirectionSchema = z.enum(["up", "down", "flat"]);

const BacktestDetailPointSchema = z.object({
  targetDate: z.string().datetime(),
  originWeekEndDate: z.string().datetime(),
  anchorKrwPerL: z.number().finite(),
  actualKrwPerL: z.number().finite(),
  forecastKrwPerL: z.number().finite(),
  absoluteErrorKrwPerL: z.number().finite(),
  absolutePercentageErrorPct: z.number().finite().nullable(),
  actualDirection: DirectionSchema,
  forecastDirection: DirectionSchema,
});

const BacktestDetailMetadataSchema = z.object({
  model: z.object({
    backtestOneStepPoints: z.array(BacktestDetailPointSchema),
  }),
});

export function serializeBacktestOneStepPoints(
  points: readonly WalkForwardEvaluationPoint[],
  limit = BACKTEST_DETAIL_STORED_LIMIT,
): BacktestDetailPoint[] {
  return points.slice(-limit).map((point) => ({
    targetDate: point.targetDate.toISOString(),
    originWeekEndDate: point.originWeekEndDate.toISOString(),
    anchorKrwPerL: point.anchorKrwPerL,
    actualKrwPerL: point.actualKrwPerL,
    forecastKrwPerL: point.forecastKrwPerL,
    absoluteErrorKrwPerL: point.absoluteErrorKrwPerL,
    absolutePercentageErrorPct: point.absolutePercentageErrorPct,
    actualDirection: point.actualDirection,
    forecastDirection: point.forecastDirection,
  }));
}

export function readBacktestOneStepPoints(metadata: unknown): BacktestDetailPoint[] {
  const parsed = BacktestDetailMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.backtestOneStepPoints : [];
}

/** 저장된 one-step 결과를 표시용 행과 요약으로 바꾼다. 새 백테스트를 실행하지 않는다. */
export function buildBacktestDetail(
  points: readonly BacktestDetailPoint[],
  limit = BACKTEST_DETAIL_DISPLAY_LIMIT,
): BacktestDetail {
  const selected = [...points]
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate))
    .slice(-limit);

  if (selected.length === 0) {
    return { rows: [], summary: null };
  }

  const highlighted = new Set(
    [...selected]
      .sort((left, right) => right.absoluteErrorKrwPerL - left.absoluteErrorKrwPerL)
      .slice(0, HIGHLIGHT_COUNT)
      .map((point) => point.targetDate),
  );
  const rows = selected.map((point) => ({
    ...point,
    signedErrorKrwPerL: point.forecastKrwPerL - point.actualKrwPerL,
    directionHit: point.actualDirection === point.forecastDirection,
    highlighted: highlighted.has(point.targetDate),
  }));
  const percentagePoints = rows.flatMap((row) =>
    row.absolutePercentageErrorPct === null ? [] : [row.absolutePercentageErrorPct],
  );

  return {
    rows,
    summary: {
      sampleCount: rows.length,
      maeKrwPerL: rows.reduce((sum, row) => sum + row.absoluteErrorKrwPerL, 0) / rows.length,
      mapePct:
        percentagePoints.length === 0
          ? null
          : percentagePoints.reduce((sum, value) => sum + value, 0) / percentagePoints.length,
      directionHitCount: rows.filter((row) => row.directionHit).length,
      maxAbsoluteErrorKrwPerL: Math.max(...rows.map((row) => row.absoluteErrorKrwPerL)),
    },
  };
}
