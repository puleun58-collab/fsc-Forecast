export type DashboardAvailability = 'available' | 'unavailable';
export type DashboardTrendDirection = 'up' | 'down' | 'flat';
export type DashboardDataSourceStatus = 'available' | 'delayed' | 'unavailable';

export interface DashboardDataSource {
  sourceCode: 'opinet-diesel' | 'opinet-dubai-daily' | 'ecb-usd-krw';
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

export interface FscDashboardMarketTrendPoint {
  observedAt: string;
  value: number;
}

export interface FscDashboardMarketSignal {
  indicatorCode: 'dubai' | 'usd-krw';
  displayName: string;
  status: 'ready' | 'checking' | 'unavailable';
  latestObservationDate: string | null;
  collectedAt: string | null;
  previousObservationDate: string | null;
  value: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: DashboardTrendDirection;
  explanation: string;
  unitLabel: 'USD/BBL' | '원/USD';
  valueBasisLabel: string;
  providerName: string;
  sourceUrl: string;
  trendWindowDays: number;
  history: FscDashboardMarketTrendPoint[];
}

export interface FscDashboardMarketSignalsSection {
  status: 'ready' | 'checking' | 'insufficient_data' | 'unavailable';
  summaryText: string;
  signals: FscDashboardMarketSignal[];
  unavailableReason?: string;
}

export interface FscDashboardForecastChangeSection {
  comparisonStatus: 'available' | 'unavailable';
  previousQuarterAverageKrwPerL: number | null;
  currentQuarterAverageKrwPerL: number;
  absoluteChangeKrwPerL: number | null;
  direction: DashboardTrendDirection;
  summaryText: string;
  newActualWeekCount: number;
  newActualWeekLabel: string | null;
}

export type OilPriceHistoryQuarterNumber = 1 | 2 | 3 | 4;

export type OilPriceHistoryMonth = {
  readonly year: number;
  readonly month: number;
  readonly quarter: OilPriceHistoryQuarterNumber;
  readonly averagePriceKrwPerL: number;
  readonly dataBasisDate: string;
};

export type OilPriceHistoryQuarterChange = {
  readonly amountKrwPerL: number;
  readonly percent: number;
};

export type OilPriceHistoryQuarter = {
  readonly year: number;
  readonly quarter: OilPriceHistoryQuarterNumber;
  readonly months: readonly OilPriceHistoryMonth[];
  readonly averagePriceKrwPerL: number | null;
  readonly changeFromPreviousQuarter: OilPriceHistoryQuarterChange | null;
};

export type OilPriceHistoryYear = {
  readonly year: number;
  readonly quarters: readonly OilPriceHistoryQuarter[];
  readonly latestDataBasisDate: string;
};

export type OilPriceHistorySection = {
  readonly defaultYear: number;
  readonly availableYears: readonly number[];
  readonly years: readonly OilPriceHistoryYear[];
};

export interface FscDashboardWeekItem {
  sequenceNo: number;
  targetMonth: number;
  weekNo: number;
  weekStartDate: string;
  weekEndDate: string;
  officialWeekLabel: string | null;
  priceKind: 'actual' | 'forecast';
  priceKrwPerL: string | null;
  actualPriceKrwPerL: string | null;
  forecastPriceKrwPerL: string | null;
  forecastLowerBoundKrwPerL: string | null;
  forecastUpperBoundKrwPerL: string | null;
  forecastSourceKind: 'weekly_point' | 'weekly_trend_extension' | null;
  fallbackUsed: boolean;
  priceDiffKrwPerL: string | null;
  diffRatio: string | null;
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
  baseReliabilityGrade: string | null;
  reliabilityAdjustmentReasons: string[];
  quarterAverageKrwPerL: string;
  quarterAverageBasisKind: 'official_quarterly' | 'official_monthly_average' | 'weekly_actual_forecast';
  priceDiffKrwPerL: string;
  diffRatio: string;
  oilWeightRate: string;
  actualWeekCount: number;
  forecastWeekCount: number;
  reliabilitySampleCount: number;
  reliabilityMinimumSampleCount: number;
  recent13wWeeklyPriceMape: string | null;
  recent26wWeeklyPriceMae: string | null;
  recent4wErrorTrend: string | null;
  previousWeekPriceKrwPerL: string | null;
  weeks: FscDashboardWeekItem[];
  referenceQuarterAverageKrwPerL: string | null;
  referenceMonthlyBasis: Array<{
    monthLabel: string;
    priceKrwPerL: string;
  }>;
  forecastChange: FscDashboardForecastChangeSection;
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
  availableQuarters: FscDashboardQuarterSummary[];
  isActiveQuarterSelected: boolean;
  support: FscDashboardSupportSection;
  dataSources: DashboardDataSource[];
}

export interface FscDashboardAvailableData {
  state: 'available';
  quarter: FscDashboardQuarterSummary;
  availableQuarters: FscDashboardQuarterSummary[];
  isActiveQuarterSelected: boolean;
  fsc: FscDashboardResultSection;
  support: FscDashboardSupportSection;
  dataSources: DashboardDataSource[];
}

export type FscDashboardData = FscDashboardUnavailableData | FscDashboardEmptyData | FscDashboardAvailableData;
