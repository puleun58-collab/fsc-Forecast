/**
 * 신뢰도 계산이 이미 기록한 guardrail 사유를 관리자 화면용 상태로 분류한다.
 * 새 임계값을 만들지 않고 저장된 판정 결과만 해석한다.
 */
export type ForecastQualitySignalCode =
  | 'recent_4w_error_worsening'
  | 'long_window_instability'
  | 'long_window_caution'
  | 'incomplete_guardrail_metrics';

export type ForecastQualityDataNoticeCode = 'data_unavailable' | 'data_stale' | 'data_delayed';

export type ForecastQualityStatus = 'stable' | 'attention' | 'unrated';

const MODEL_QUALITY_SIGNAL_CODES: readonly ForecastQualitySignalCode[] = [
  'recent_4w_error_worsening',
  'long_window_instability',
  'long_window_caution',
  'incomplete_guardrail_metrics',
];

const DATA_NOTICE_CODES: readonly ForecastQualityDataNoticeCode[] = [
  'data_unavailable',
  'data_stale',
  'data_delayed',
];

export type AssessForecastQualityInput = {
  adjustmentReasons: readonly string[];
  reliabilityGrade: string | null;
  reliabilitySampleCount: number;
  reliabilityMinimumSampleCount: number;
  recent4wErrorTrend: string | null;
  dataFreshnessStatus: string | null;
  hasReliabilityRecord: boolean;
};

export type ForecastQualityAssessment = {
  status: ForecastQualityStatus;
  signals: readonly ForecastQualitySignalCode[];
  dataNotice: ForecastQualityDataNoticeCode | null;
  recent4wErrorTrend: string | null;
  dataFreshnessStatus: string | null;
  reliabilitySampleCount: number;
  reliabilityMinimumSampleCount: number;
};

export function assessForecastQuality(input: AssessForecastQualityInput): ForecastQualityAssessment {
  const signals = MODEL_QUALITY_SIGNAL_CODES.filter((code) => input.adjustmentReasons.includes(code));
  const dataNotice =
    DATA_NOTICE_CODES.find((code) => input.adjustmentReasons.includes(code)) ??
    (input.dataFreshnessStatus === 'unavailable'
      ? 'data_unavailable'
      : input.dataFreshnessStatus === 'stale'
        ? 'data_stale'
        : input.dataFreshnessStatus === 'delayed'
          ? 'data_delayed'
          : null);
  const unrated =
    !input.hasReliabilityRecord ||
    input.reliabilityGrade === null ||
    input.reliabilityGrade === 'U' ||
    input.reliabilitySampleCount < input.reliabilityMinimumSampleCount;

  return {
    status: unrated ? 'unrated' : signals.length > 0 ? 'attention' : 'stable',
    signals,
    dataNotice,
    recent4wErrorTrend: input.recent4wErrorTrend,
    dataFreshnessStatus: input.dataFreshnessStatus,
    reliabilitySampleCount: input.reliabilitySampleCount,
    reliabilityMinimumSampleCount: input.reliabilityMinimumSampleCount,
  };
}
