export type DashboardMarketScope = 'national-average';
export type DashboardAvailability = 'available' | 'unavailable';
export type DashboardTrendDirection = 'up' | 'down' | 'flat';
export type DashboardForecastApproval = 'pending' | 'approved' | 'degraded';
export type DashboardCommentaryStatus = 'ready' | 'insufficient_data' | 'unavailable';

export interface DashboardUnavailableState {
  availability: 'unavailable';
  reason: string;
  detail: string;
}

export interface DashboardSummaryValue {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}

export interface DashboardSnapshotSummary {
  snapshotId: string;
  createdAt: string;
  completedAt: string | null;
  currentTruthCutoffAt: string | null;
  currentRowCount: number;
}

export interface DashboardCurrentStatus {
  latestPriceDate: string;
  latestPriceKrwPerL: number;
  previousPriceDate: string | null;
  previousPriceKrwPerL: number | null;
  absoluteChangeKrwPerL: number | null;
  percentChange: number | null;
  direction: DashboardTrendDirection;
  currentRevisionId: string;
  sourceObservedAt: string | null;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
}

export interface DashboardTrendPoint {
  date: string;
  priceKrwPerL: number;
}

export interface DashboardTrendSection {
  availability: DashboardAvailability;
  points: DashboardTrendPoint[];
  latestWeeklyAverageKrwPerL: number | null;
  latestMonthlyAverageKrwPerL: number | null;
  unavailableReason?: string;
}

export interface DashboardForecastPoint {
  horizonKind: 'weekly' | 'monthly';
  horizonIndex: number;
  targetDate: string;
  pointKrwPerL: number;
  lowerBoundKrwPerL: number | null;
  upperBoundKrwPerL: number | null;
}

export interface DashboardForecastSection {
  availability: DashboardAvailability;
  approvalState: DashboardForecastApproval | null;
  degradedReason: string | null;
  generatedAt: string | null;
  weeklyPoints: DashboardForecastPoint[];
  monthlyPoints: DashboardForecastPoint[];
  mapePct: number | null;
  maeKrwPerL: number | null;
  unavailableReason?: string;
}

export interface DashboardCommentarySignal {
  indicatorCode: 'dubai' | 'brent' | 'wti' | 'usd-krw';
  reasonText: string;
}

export interface DashboardCommentarySection {
  status: DashboardCommentaryStatus;
  generatedAt: string | null;
  text: string | null;
  signals: DashboardCommentarySignal[];
  unavailableReason?: string;
}



export interface DashboardAvailableData {
  availability: 'available';
  marketScope: DashboardMarketScope;
  datasetKey: string;
  snapshot: DashboardSnapshotSummary;
  status: DashboardCurrentStatus;
  summaryValues: DashboardSummaryValue[];
  trend: DashboardTrendSection;
  forecast: DashboardForecastSection;
  commentary: DashboardCommentarySection;
}

export interface DashboardUnavailableData {
  availability: 'unavailable';
  marketScope: DashboardMarketScope;
  datasetKey: string;
  unavailable: DashboardUnavailableState;
}

export type DashboardData = DashboardAvailableData | DashboardUnavailableData;
