export interface FscReliabilityTrail {
  baseGrade: string | null;
  finalGrade: string | null;
  adjustmentReasons: string[];
  recent13wWeeklyPriceMape: string | null;
  recent13wWeeklyPriceMae: string | null;
  recent26wWeeklyPriceMae: string | null;
  recent4wErrorTrend: string | null;
  dataFreshnessStatus: string | null;
}

const EMPTY_TRAIL: FscReliabilityTrail = {
  baseGrade: null,
  finalGrade: null,
  adjustmentReasons: [],
  recent13wWeeklyPriceMape: null,
  recent13wWeeklyPriceMae: null,
  recent26wWeeklyPriceMae: null,
  recent4wErrorTrend: null,
  dataFreshnessStatus: null,
};

function readString(source: object, key: string): string | null {
  if (!(key in source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export function readFscReliabilityTrail(calculationPayload: unknown): FscReliabilityTrail {
  if (!calculationPayload || typeof calculationPayload !== 'object' || !('reliability' in calculationPayload)) {
    return EMPTY_TRAIL;
  }

  const reliability = calculationPayload.reliability;

  if (!reliability || typeof reliability !== 'object') {
    return EMPTY_TRAIL;
  }

  const rawReasons = 'adjustmentReasons' in reliability ? reliability.adjustmentReasons : null;

  return {
    baseGrade: readString(reliability, 'baseGrade'),
    finalGrade: readString(reliability, 'finalGrade'),
    adjustmentReasons: Array.isArray(rawReasons)
      ? rawReasons.filter((reason): reason is string => typeof reason === 'string')
      : [],
    recent13wWeeklyPriceMape: readString(reliability, 'recent13wWeeklyPriceMape'),
    recent13wWeeklyPriceMae: readString(reliability, 'recent13wWeeklyPriceMae'),
    recent26wWeeklyPriceMae: readString(reliability, 'recent26wWeeklyPriceMae'),
    recent4wErrorTrend: readString(reliability, 'recent4wErrorTrend'),
    dataFreshnessStatus: readString(reliability, 'dataFreshnessStatus'),
  };
}
