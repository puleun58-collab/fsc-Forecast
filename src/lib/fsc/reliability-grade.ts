import type { Prisma } from '@prisma/client';

import { MIN_RELIABILITY_SAMPLE_COUNT } from './types';

export type ReliabilityGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'U';

export type ReliabilityDataFreshnessStatus = 'fresh' | 'delayed' | 'stale' | 'unavailable';

export const RELIABILITY_GRADE_ORDER: readonly ReliabilityGrade[] = ['A+', 'A', 'B', 'C', 'D', 'E'];

export const LONG_WINDOW_CAUTION_RATIO = 1.25;
export const LONG_WINDOW_INSTABILITY_RATIO = 1.5;
export const MAX_RELIABILITY_DOWNGRADE_STEPS = 2;

export interface ApplyReliabilityGuardrailsInput {
  baseGrade: ReliabilityGrade;
  recent4wErrorTrend: string | null;
  recent13wMaeKrwPerL: Prisma.Decimal | null;
  recent26wMaeKrwPerL: Prisma.Decimal | null;
  dataFreshnessStatus: ReliabilityDataFreshnessStatus;
}

export interface ApplyReliabilityGuardrailsResult {
  grade: ReliabilityGrade;
  reasons: string[];
}

export function calculateBaseReliabilityGrade(
  sampleCount: number,
  recent13wMapePct: Prisma.Decimal | null,
): ReliabilityGrade {
  if (sampleCount < MIN_RELIABILITY_SAMPLE_COUNT || recent13wMapePct === null) {
    return 'U';
  }

  const mape = recent13wMapePct.toNumber();

  if (!Number.isFinite(mape)) {
    return 'U';
  }

  if (mape <= 1) return 'A+';
  if (mape <= 1.5) return 'A';
  if (mape <= 2.5) return 'B';
  if (mape <= 4) return 'C';
  if (mape <= 6) return 'D';

  return 'E';
}

export function applyReliabilityGuardrails(
  input: ApplyReliabilityGuardrailsInput,
): ApplyReliabilityGuardrailsResult {
  if (input.baseGrade === 'U') {
    return { grade: 'U', reasons: [] };
  }

  if (input.dataFreshnessStatus === 'unavailable') {
    return { grade: 'U', reasons: ['data_unavailable'] };
  }

  const reasons: string[] = [];
  const recent13wMae = input.recent13wMaeKrwPerL?.toNumber() ?? null;
  const recent26wMae = input.recent26wMaeKrwPerL?.toNumber() ?? null;
  const longWindowRatio =
    recent13wMae === null || recent26wMae === null || recent13wMae <= 0
      ? null
      : recent26wMae / recent13wMae;
  let downgradeSteps = 0;

  if (input.recent4wErrorTrend === 'worsening') {
    downgradeSteps += 1;
    reasons.push('recent_4w_error_worsening');
  }

  if (longWindowRatio !== null && longWindowRatio > LONG_WINDOW_INSTABILITY_RATIO) {
    downgradeSteps += 1;
    reasons.push('long_window_instability');
  }

  const baseIndex = RELIABILITY_GRADE_ORDER.indexOf(input.baseGrade);
  const cappedSteps = Math.min(downgradeSteps, MAX_RELIABILITY_DOWNGRADE_STEPS);
  let gradeIndex = Math.min(baseIndex + cappedSteps, RELIABILITY_GRADE_ORDER.length - 1);
  const aPlusIndex = RELIABILITY_GRADE_ORDER.indexOf('A');

  if (gradeIndex === 0) {
    if (
      longWindowRatio !== null &&
      longWindowRatio > LONG_WINDOW_CAUTION_RATIO &&
      longWindowRatio <= LONG_WINDOW_INSTABILITY_RATIO
    ) {
      gradeIndex = aPlusIndex;
      reasons.push('long_window_caution');
    }

    if (input.dataFreshnessStatus === 'stale') {
      gradeIndex = aPlusIndex;
      reasons.push('data_stale');
    }

    if (input.recent4wErrorTrend === null || longWindowRatio === null) {
      gradeIndex = aPlusIndex;
      reasons.push('incomplete_guardrail_metrics');
    }
  }

  if (input.dataFreshnessStatus === 'delayed') {
    reasons.push('data_delayed');
  }

  return {
    grade: RELIABILITY_GRADE_ORDER[gradeIndex],
    reasons,
  };
}
