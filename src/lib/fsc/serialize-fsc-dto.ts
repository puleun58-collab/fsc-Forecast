import type {
  FscDataFreshnessStatus,
  FscForecastSourceKind,
  FscPriceKind,
  FscQuarterWeek,
  FscResult,
  QuarterSetting,
} from '@prisma/client';

export interface FscQuarterWeekDto {
  sequenceNo: number;
  targetMonth: number;
  weekNo: number;
  weekStartDate: string;
  weekEndDate: string;
  priceKind: FscPriceKind;
  priceKrwPerL: string;
  actualPriceKrwPerL: string | null;
  forecastPriceKrwPerL: string | null;
  sourcePriceDate: string | null;
  forecastSourceKind: FscForecastSourceKind | null;
  fallbackUsed: boolean;
  basePriceKrwPerL: string;
  priceDiffKrwPerL: string;
  diffRatio: string;
}

export interface FscResultDto {
  id: string;
  scenarioName: string;
  quarter: {
    targetYear: number;
    targetQuarter: number;
    referenceYear: number;
    referenceQuarter: number;
    quarterStartDate: string;
    quarterEndDate: string;
  };
  calculationFormulaVersion: string;
  forecastModelVersion: string | null;
  basePriceKrwPerL: string;
  appliedPriceKrwPerL: string;
  quarterAverageKrwPerL: string;
  priceDiffKrwPerL: string;
  diffRatio: string;
  fscLowRate: string;
  fscHighRate: string;
  fscLowKrwPerL: string;
  fscHighKrwPerL: string;
  actualWeekCount: number;
  forecastWeekCount: number;
  qualityMetrics: {
    recent13wWeeklyPriceMae: string | null;
    recent13wWeeklyPriceMape: string | null;
    recent13wQuarterAveragePriceMae: string | null;
    recent13wDirectionAccuracy: string | null;
    recent4wWeeklyPriceMae: string | null;
    recent4wErrorTrend: string | null;
    recent26wWeeklyPriceMae: string | null;
    forecastBias4w: string | null;
    forecastBias13w: string | null;
  };
  reliabilityGrade: string;
  dataFreshnessStatus: FscDataFreshnessStatus;
  approvalStatus: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  weeks: FscQuarterWeekDto[];
}

export type FscResultRecord = FscResult & {
  quarterSetting: QuarterSetting;
  weeks: FscQuarterWeek[];
};

function formatOptionalDecimal(value: { toFixed: (scale: number) => string } | null, scale: number): string | null {
  return value === null ? null : value.toFixed(scale);
}

function serializeFscQuarterWeek(value: FscQuarterWeek): FscQuarterWeekDto {
  return {
    sequenceNo: value.sequenceNo,
    targetMonth: value.targetMonth,
    weekNo: value.weekNo,
    weekStartDate: value.weekStartDate.toISOString(),
    weekEndDate: value.weekEndDate.toISOString(),
    priceKind: value.priceKind,
    priceKrwPerL: value.priceKrwPerL.toFixed(3),
    actualPriceKrwPerL: formatOptionalDecimal(value.actualPriceKrwPerL, 3),
    forecastPriceKrwPerL: formatOptionalDecimal(value.forecastPriceKrwPerL, 3),
    sourcePriceDate: value.sourcePriceDate?.toISOString() ?? null,
    forecastSourceKind: value.forecastSourceKind ?? null,
    fallbackUsed: value.fallbackUsed,
    basePriceKrwPerL: value.basePriceKrwPerL.toFixed(3),
    priceDiffKrwPerL: value.priceDiffKrwPerL.toFixed(3),
    diffRatio: value.diffRatio.toFixed(6),
  };
}

export function serializeFscResultDto(value: FscResultRecord): FscResultDto {
  return {
    id: value.id,
    scenarioName: value.scenarioName,
    quarter: {
      targetYear: value.targetYear,
      targetQuarter: value.targetQuarter,
      referenceYear: value.quarterSetting.referenceYear,
      referenceQuarter: value.quarterSetting.referenceQuarter,
      quarterStartDate: value.quarterSetting.quarterStartDate.toISOString(),
      quarterEndDate: value.quarterSetting.quarterEndDate.toISOString(),
    },
    calculationFormulaVersion: value.calculationFormulaVersion,
    forecastModelVersion: value.forecastModelVersion ?? null,
    basePriceKrwPerL: value.basePriceKrwPerL.toFixed(3),
    appliedPriceKrwPerL: value.appliedPriceKrwPerL.toFixed(3),
    quarterAverageKrwPerL: value.quarterAverageKrwPerL.toFixed(3),
    priceDiffKrwPerL: value.priceDiffKrwPerL.toFixed(3),
    diffRatio: value.diffRatio.toFixed(6),
    fscLowRate: value.fscLowRate.toFixed(4),
    fscHighRate: value.fscHighRate.toFixed(4),
    fscLowKrwPerL: value.fscLowKrwPerL.toFixed(3),
    fscHighKrwPerL: value.fscHighKrwPerL.toFixed(3),
    actualWeekCount: value.actualWeekCount,
    forecastWeekCount: value.forecastWeekCount,
    qualityMetrics: {
      recent13wWeeklyPriceMae: formatOptionalDecimal(value.recent13wWeeklyPriceMae, 3),
      recent13wWeeklyPriceMape: formatOptionalDecimal(value.recent13wWeeklyPriceMape, 6),
      recent13wQuarterAveragePriceMae: formatOptionalDecimal(value.recent13wQuarterAveragePriceMae, 3),
      recent13wDirectionAccuracy: formatOptionalDecimal(value.recent13wDirectionAccuracy, 6),
      recent4wWeeklyPriceMae: formatOptionalDecimal(value.recent4wWeeklyPriceMae, 3),
      recent4wErrorTrend: value.recent4wErrorTrend ?? null,
      recent26wWeeklyPriceMae: formatOptionalDecimal(value.recent26wWeeklyPriceMae, 3),
      forecastBias4w: formatOptionalDecimal(value.forecastBias4w, 3),
      forecastBias13w: formatOptionalDecimal(value.forecastBias13w, 3),
    },
    reliabilityGrade: value.reliabilityGrade,
    dataFreshnessStatus: value.dataFreshnessStatus,
    approvalStatus: value.approvalStatus,
    approvedAt: value.approvedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    weeks: [...value.weeks]
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map(serializeFscQuarterWeek),
  };
}
