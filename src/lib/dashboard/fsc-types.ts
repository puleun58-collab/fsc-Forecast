export type DashboardAvailability = 'available' | 'unavailable';
export type DashboardTrendDirection = 'up' | 'down' | 'flat';

export interface FscDashboardQuarterSummary {
  targetYear: number;
  targetQuarter: number;
  referenceYear: number;
  referenceQuarter: number;
  quarterStartDate: string;
  quarterEndDate: string;
  status: string;
  isActive: boolean;
}

export interface FscDashboardCurrentPriceSection {
  availability: DashboardAvailability;
  latestPriceDate: string | null;
  latestPriceKrwPerL: number | null;
  previousPriceDate: string | null;
  previousPriceKrwPerL: number | null;
  absoluteChangeKrwPerL: number | null;
  percentChange: number | null;
  direction: DashboardTrendDirection;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  sourceObservedAt: string | null;
  unavailableReason?: string;
}

export interface FscDashboardTrendPoint {
  date: string;
  priceKrwPerL: number;
}

export interface FscDashboardTrendSection {
  availability: DashboardAvailability;
  points: FscDashboardTrendPoint[];
  latestWeeklyAverageKrwPerL: number | null;
  latestMonthlyAverageKrwPerL: number | null;
  unavailableReason?: string;
}

export interface FscDashboardWeekItem {
  sequenceNo: number;
  targetMonth: number;
  weekNo: number;
  weekStartDate: string;
  weekEndDate: string;
  priceKind: 'actual' | 'forecast';
  priceKrwPerL: string;
  actualPriceKrwPerL: string | null;
  forecastPriceKrwPerL: string | null;
  forecastSourceKind: 'weekly_point' | 'monthly_point' | 'carry_forward' | 'applied_price_fallback' | 'base_price_fallback' | null;
  fallbackUsed: boolean;
  priceDiffKrwPerL: string;
  diffRatio: string;
}

export interface FscDashboardResultSection {
  resultId: string;
  createdAt: string;
  approvalStatus: string;
  dataFreshnessStatus: string;
  reliabilityGrade: string;
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
  recent13wWeeklyPriceMape: string | null;
  recent26wWeeklyPriceMae: string | null;
  recent4wErrorTrend: string | null;
  weeks: FscDashboardWeekItem[];
  referenceQuarterAverageKrwPerL: string | null;
  referenceMonthlyBasis: Array<{
    monthLabel: string;
    priceKrwPerL: string;
  }>;
}

export interface FscDashboardExportSection {
  status: 'coming_soon';
  label: string;
  message: string;
}

export interface FscDashboardSupportSection {
  currentPrice: FscDashboardCurrentPriceSection;
  trend: FscDashboardTrendSection;
}

export interface FscDashboardUnavailableData {
  state: 'unavailable';
  reason: string;
  detail: string;
}

export interface FscDashboardEmptyData {
  state: 'empty';
  quarter: FscDashboardQuarterSummary;
  support: FscDashboardSupportSection;
  export: FscDashboardExportSection;
}

export interface FscDashboardAvailableData {
  state: 'available';
  quarter: FscDashboardQuarterSummary;
  fsc: FscDashboardResultSection;
  support: FscDashboardSupportSection;
  export: FscDashboardExportSection;
}

export type FscDashboardData = FscDashboardUnavailableData | FscDashboardEmptyData | FscDashboardAvailableData;
