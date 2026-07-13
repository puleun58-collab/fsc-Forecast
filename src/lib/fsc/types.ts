import { Prisma } from '@prisma/client';

export type DecimalLike = Prisma.Decimal | string | number;

export interface CalculateFscResultInput {
  basePriceKrwPerL: DecimalLike;
  appliedPriceKrwPerL: DecimalLike;
  quarterAverageKrwPerL: DecimalLike;
  fscLowRate: DecimalLike;
  fscHighRate: DecimalLike;
}

export interface CalculateFscResultOutput {
  calculationFormulaVersion: 'fsc-v1';
  basePriceKrwPerL: Prisma.Decimal;
  appliedPriceKrwPerL: Prisma.Decimal;
  quarterAverageKrwPerL: Prisma.Decimal;
  priceDiffKrwPerL: Prisma.Decimal;
  diffRatio: Prisma.Decimal;
  fscLowRate: Prisma.Decimal;
  fscHighRate: Prisma.Decimal;
  fscLowKrwPerL: Prisma.Decimal;
  fscHighKrwPerL: Prisma.Decimal;
}

export interface FscRegressionFixture {
  input: CalculateFscResultInput;
  expected: {
    priceDiffKrwPerL: string;
    diffRatio: string;
    fscLowKrwPerL: string;
    fscHighKrwPerL: string;
  };
}

export const FSC_EXCEL_REGRESSION_FIXTURE: FscRegressionFixture = {
  input: {
    basePriceKrwPerL: '1500.000',
    appliedPriceKrwPerL: '1500.000',
    quarterAverageKrwPerL: '1990.364',
    fscLowRate: '0.3000',
    fscHighRate: '0.7000',
  },
  expected: {
    priceDiffKrwPerL: '490.364',
    diffRatio: '0.326909',
    fscLowKrwPerL: '2185.564',
    fscHighKrwPerL: '2445.832',
  },
};

export interface FscSourceDailyPriceRow {
  priceDate: Date;
  currentRevisionId: string;
  observedPriceKrwPerL: Prisma.Decimal;
}

export interface FscSourceForecastPointRow {
  id: string;
  horizonKind: 'weekly' | 'monthly';
  horizonIndex: number;
  targetDate: Date;
  pointKrwPerL: Prisma.Decimal;
}

export interface FscSourceSnapshotRecord {
  id: string;
  datasetKey: string;
  currentTruthCutoffAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface FscSourceForecastRunRecord {
  id: string;
  forecastModelVersion: string | null;
  mapePct: Prisma.Decimal | null;
  maeKrwPerL: Prisma.Decimal | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  completedAt: Date | null;
  points: FscSourceForecastPointRow[];
}

export interface LoadFscSourceDataResult {
  recomputeSnapshot: FscSourceSnapshotRecord;
  forecastRun: FscSourceForecastRunRecord | null;
  dailyPrices: FscSourceDailyPriceRow[];
  officialWeeklyPrices: FscSourceOfficialWeeklyPriceRow[];
  officialMonthlyPrices: FscSourceOfficialMonthlyPriceRow[];
}

export interface FscSourceOfficialWeeklyPriceRow {
  weekKey: string;
  weekLabel: string;
  weekStartDate: Date;
  weekEndDate: Date;
  priceKrwPerL: Prisma.Decimal;
  fetchedAt: Date;
}

export interface FscSourceOfficialMonthlyPriceRow {
  monthKey: string;
  monthLabel: string;
  monthStartDate: Date;
  monthEndDate: Date;
  priceKrwPerL: Prisma.Decimal;
  fetchedAt: Date;
}

export interface FscMonthlyBasisSummary {
  referenceYear: number;
  referenceQuarter: number;
  monthRows: Array<{
    monthKey: string;
    monthLabel: string;
    priceKrwPerL: Prisma.Decimal;
  }>;
  quarterAverageKrwPerL: Prisma.Decimal | null;
}

export interface FscActualSourceBreakdown {
  officialWeekly: number;
  dailyAverage: number;
}

export interface FscQuarterWeekDraft {
  targetYear: number;
  targetQuarter: number;
  targetMonth: number;
  weekNo: number;
  sequenceNo: number;
  weekStartDate: Date;
  weekEndDate: Date;
  priceKind: 'actual' | 'forecast';
  priceKrwPerL: Prisma.Decimal;
  actualPriceKrwPerL: Prisma.Decimal | null;
  forecastPriceKrwPerL: Prisma.Decimal | null;
  sourcePriceDate: Date | null;
  sourceRevisionIds: Prisma.JsonValue | null;
  forecastPointId: string | null;
  forecastSourceKind: 'weekly_point' | 'monthly_point' | 'carry_forward' | 'applied_price_fallback' | 'base_price_fallback' | null;
  fallbackUsed: boolean;
  basePriceKrwPerL: Prisma.Decimal;
  priceDiffKrwPerL: Prisma.Decimal;
  diffRatio: Prisma.Decimal;
}

export interface BuildFscQuarterWeeksResult {
  weeks: FscQuarterWeekDraft[];
  actualWeekCount: number;
  forecastWeekCount: number;
  quarterAverageKrwPerL: Prisma.Decimal;
  monthlyBasis: FscMonthlyBasisSummary | null;
  calculationPayload: Prisma.InputJsonValue;
}

export interface CalculateFscReliabilityInput {
  forecastRun: FscSourceForecastRunRecord | null;
  currentTruthCutoffAt: Date | null;
  now?: Date;
}

export interface CalculateFscReliabilityOutput {
  recent13wWeeklyPriceMae: Prisma.Decimal | null;
  recent13wWeeklyPriceMape: Prisma.Decimal | null;
  recent13wQuarterAveragePriceMae: Prisma.Decimal | null;
  recent13wDirectionAccuracy: Prisma.Decimal | null;
  recent4wWeeklyPriceMae: Prisma.Decimal | null;
  recent4wErrorTrend: string | null;
  recent26wWeeklyPriceMae: Prisma.Decimal | null;
  forecastBias4w: Prisma.Decimal | null;
  forecastBias13w: Prisma.Decimal | null;
  reliabilityGrade: string;
  dataFreshnessStatus: 'fresh' | 'delayed' | 'stale' | 'unavailable';
}
