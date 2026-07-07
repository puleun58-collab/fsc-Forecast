export const NATIONAL_AVERAGE_MARKET_SCOPE = "national-average";
export const NATIONAL_AVERAGE_DATASET_KEY = "national-average-opinet-diesel";

export type AggregateMarketScope = typeof NATIONAL_AVERAGE_MARKET_SCOPE;
export type AggregateInputDate = Date | string;

export interface AggregateDailyTruthPoint {
  priceDate: AggregateInputDate;
  observedPriceKrwPerL: number;
  datasetKey?: string;
  currentRevisionId?: string | null;
  latestRecomputeSnapshotId?: string | null;
}

export interface AggregateDailyPoint {
  periodKind: "daily";
  priceDate: string;
  observedPriceKrwPerL: number;
  currentRevisionId: string | null;
  latestRecomputeSnapshotId: string | null;
}

export interface AggregateSeriesIdentity {
  datasetKey: string;
  marketScope: AggregateMarketScope;
}

export interface AggregatePeriodSummary {
  sampleCount: number;
  averagePriceKrwPerL: number;
  openingPriceKrwPerL: number;
  closingPriceKrwPerL: number;
  minPriceKrwPerL: number;
  maxPriceKrwPerL: number;
  absoluteChangeKrwPerL: number;
  percentChangeFromOpen: number | null;
}

export interface WeeklyAggregatePoint extends AggregatePeriodSummary {
  periodKind: "weekly";
  weekKey: string;
  isoWeekYear: number;
  isoWeek: number;
  weekStartDate: string;
  weekEndDate: string;
}

export interface MonthlyAggregatePoint extends AggregatePeriodSummary {
  periodKind: "monthly";
  monthKey: string;
  year: number;
  month: number;
  monthStartDate: string;
  monthEndDate: string;
}

export interface AggregateDailySeries extends AggregateSeriesIdentity {
  points: AggregateDailyPoint[];
}

export interface WeeklyAggregateSeries extends AggregateSeriesIdentity {
  points: WeeklyAggregatePoint[];
}

export interface MonthlyAggregateSeries extends AggregateSeriesIdentity {
  points: MonthlyAggregatePoint[];
}

export interface AggregateSeriesCounts {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface AggregateSeriesLatest {
  daily: AggregateDailyPoint | null;
  weekly: WeeklyAggregatePoint | null;
  monthly: MonthlyAggregatePoint | null;
}

export interface AggregateSeriesSnapshot extends AggregateSeriesIdentity {
  currentTruthCutoffAt: string | null;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  latestObservedPriceKrwPerL: number | null;
  counts: AggregateSeriesCounts;
  latest: AggregateSeriesLatest;
  daily: AggregateDailySeries;
  weekly: WeeklyAggregateSeries;
  monthly: MonthlyAggregateSeries;
}

export interface BuildAggregateSeriesInput {
  dailyTruth: ReadonlyArray<AggregateDailyTruthPoint>;
  datasetKey?: string;
}

export interface BuildSeriesSnapshotInput extends BuildAggregateSeriesInput {
  currentTruthCutoffAt?: AggregateInputDate | null;
}
