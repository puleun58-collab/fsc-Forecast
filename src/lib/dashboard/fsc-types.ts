export type DashboardAvailability = 'available' | 'unavailable';
export type DashboardTrendDirection = 'up' | 'down' | 'flat';
export type DashboardDataSourceStatus = 'available' | 'delayed' | 'unavailable';

export interface DashboardDataSource {
  sourceCode: 'opinet-diesel' | 'fred-dubai' | 'fred-usd-krw';
  displayName: string;
  dataName: string;
  dataCode: string | null;
  providerName: string;
  originalProviderName: string | null;
  unitLabel: string;
  providerFrequencyLabel: string;
  collectionFrequencyLabel: string | null;
  purpose: string;
  description: string;
  latestObservationDate: string | null;
  collectedAt: string | null;
  observationGranularity: 'datetime' | 'date' | 'month';
  sourceUrl: string;
  status: DashboardDataSourceStatus;
}


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

export interface FscDashboardMarketSignal {
  indicatorCode: 'dubai' | 'usd-krw';
  displayName: string;
  latestObservationDate: string | null;
  collectedAt: string | null;
  previousObservationDate: string | null;
  value: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: DashboardTrendDirection;
  explanation: string;
}

export interface FscDashboardMarketSignalsSection {
  status: 'ready' | 'insufficient_data' | 'unavailable';
  summaryText: string;
  signals: FscDashboardMarketSignal[];
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
  dataBasisAt: string | null;
  forecastCompletedAt: string | null;
  approvedAt: string | null;
  dataDelayMinutes: number | null;
  timezone: 'Asia/Seoul';
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
  reliabilitySampleCount: number;
  reliabilityMinimumSampleCount: number;
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

export interface FscDashboardSupportSection {
  currentPrice: FscDashboardCurrentPriceSection;
  trend: FscDashboardTrendSection;
  marketSignals: FscDashboardMarketSignalsSection;
}

export interface FscDashboardUnavailableData {
  state: 'unavailable';
  reason: string;
  detail: string;
  dataSources: DashboardDataSource[];
}

export interface FscDashboardEmptyData {
  state: 'empty';
  quarter: FscDashboardQuarterSummary;
  support: FscDashboardSupportSection;
  dataSources: DashboardDataSource[];
}

export interface FscDashboardAvailableData {
  state: 'available';
  quarter: FscDashboardQuarterSummary;
  fsc: FscDashboardResultSection;
  support: FscDashboardSupportSection;
  dataSources: DashboardDataSource[];
}

export type FscDashboardData = FscDashboardUnavailableData | FscDashboardEmptyData | FscDashboardAvailableData;
