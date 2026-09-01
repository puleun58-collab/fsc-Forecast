import { formatDotDate, formatDotDateTime, formatPriceNumber } from '@/lib/dashboard/display-format';
import { getOpinetDisplayWeek, getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

import type { DashboardTrendDirection, FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

export type StatusTone = 'ok' | 'warning' | 'critical' | 'neutral';

export type ReliabilityStatusInput = {
  grade: string;
  sampleCount: number;
  minimumSampleCount: number;
  recent13wWeeklyPriceMape: number | string | null;
};

export type ReliabilityStatusView = {
  label: string;
  detail: string;
  tone: StatusTone;
};
export type WeekOverWeekChange = {
  direction: DashboardTrendDirection;
  amountKrwPerL: number;
  percent: number;
};

export const RELIABILITY_POLICY_ITEMS = [
  '공식 신뢰도 등급은 유효한 주간 백테스트 13개가 확보된 후 산정합니다.',
  '현재 분기의 Actual·Forecast 주차 수는 신뢰도 표본 수에 포함하지 않습니다.',
  '등급은 최근 13주 MAPE로 기본 산정한 뒤 최근 4주 오차 추세, 최근 26주 안정성, 데이터 최신성으로 보정합니다.',
  'MAE와 Bias는 품질 참고 지표로 사용하며 공식 등급에는 반영하지 않습니다.',
] as const;

const RELIABILITY_ADJUSTMENT_REASON_TEXT: Record<string, string> = {
  recent_4w_error_worsening: '최근 단기 오차 변동성이 커져 신뢰도 평가에 반영되었습니다.',
  long_window_instability: '장기 예측 성능의 안정성을 보수적으로 반영했습니다.',
  long_window_caution: '단기 정확도와 장기 성능을 함께 고려했습니다.',
  data_stale: '데이터 최신성 상태를 신뢰도 평가에 반영했습니다.',
  data_delayed: '데이터 수집 주기를 신뢰도 평가에 반영했습니다.',
  incomplete_guardrail_metrics: '안정성 평가에 필요한 데이터가 아직 충분하지 않아 보수적으로 평가했습니다.',
  data_unavailable: '신뢰도 평가에 필요한 데이터가 부족합니다.',
};

export const RELIABILITY_EVALUATION_NOTE =
  '신뢰도는 최근 예측 정확도뿐 아니라 단기 오차 추세, 장기 안정성, 데이터 최신성을 함께 반영해 평가합니다.';

export function mapReliabilityAdjustmentReason(code: string): string {
  return RELIABILITY_ADJUSTMENT_REASON_TEXT[code] ?? '여러 품질 지표를 종합해 평가에 반영했습니다.';
}

type WeekDisplayInput = {
  officialWeekLabel: string | null;
  weekStartDate: string;
  weekEndDate: string;
  targetMonth: number;
};

const OFFICIAL_WEEK_LABEL_PATTERN = /^\d{4}년(\d{2})월(\d)주$/;

function resolveWeekDisplay(week: WeekDisplayInput): { month: number; label: string } {
  const officialMatch =
    typeof week.officialWeekLabel === 'string'
      ? week.officialWeekLabel.match(OFFICIAL_WEEK_LABEL_PATTERN)
      : null;

  if (officialMatch) {
    const month = Number(officialMatch[1]);
    return { month, label: `${month}월 ${Number(officialMatch[2])}주차` };
  }

  let displayWeek: { month: number; weekOfMonth: number } | null = null;

  try {
    displayWeek = getOpinetDisplayWeek(week.weekStartDate, week.weekEndDate);
  } catch {
    displayWeek = null;
  }

  // 형식을 벗어난 공식 라벨은 원문을 그대로 노출하되 월 경계 판정은 오피넷 주차로 유도한다.
  if (typeof week.officialWeekLabel === 'string') {
    return { month: displayWeek?.month ?? week.targetMonth, label: week.officialWeekLabel };
  }

  return displayWeek === null
    ? { month: week.targetMonth, label: `${week.targetMonth}월` }
    : { month: displayWeek.month, label: `${displayWeek.month}월 ${displayWeek.weekOfMonth}주차` };
}

export function formatWeekDisplayName(week: WeekDisplayInput): string {
  return resolveWeekDisplay(week).label;
}

export function getWeekDisplayMonth(week: WeekDisplayInput): number {
  return resolveWeekDisplay(week).month;
}


type PriceValueSize = 'headline' | 'scenario' | 'regular' | 'compact';

type PriceValueProps = {
  value: number | string | null;
  fallback?: string;
  size?: PriceValueSize;
  unit?: '원/L' | '원';
};

const SIGNED_PERCENT_FORMATTER = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parseNumeric(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedNumber(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatPriceNumber(value)}`;
}
export function calculateWeekOverWeekChange(
  currentPrice: number | string | null,
  previousPrice: number | string | null,
): WeekOverWeekChange | null {
  const current = parseNumeric(currentPrice);
  const previous = parseNumeric(previousPrice);

  if (current === null || previous === null || previous <= 0) {
    return null;
  }

  const amountKrwPerL = Math.round((current - previous) * 100) / 100;
  const direction: DashboardTrendDirection = amountKrwPerL > 0 ? 'up' : amountKrwPerL < 0 ? 'down' : 'flat';

  return {
    direction,
    amountKrwPerL,
    percent: direction === 'flat' ? 0 : ((current - previous) / previous) * 100,
  };
}

export function formatWeekOverWeekChange(change: WeekOverWeekChange): string {
  const amount = formatSignedNumber(change.amountKrwPerL);
  const percentSign = change.percent > 0 ? '+' : '';
  const icon = change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '→';

  return `${amount}원 · ${percentSign}${SIGNED_PERCENT_FORMATTER.format(change.percent)}% ${icon}`;
}

export function PriceValue({ value, fallback = '기록 없음', size = 'regular', unit = '원/L' }: PriceValueProps) {
  if (value === null) {
    return <span className="price-value price-value--empty">{fallback}</span>;
  }

  return (
    <span className={`price-value price-value--${size}`}>
      <span className="price-value__number">{formatPriceNumber(value)}</span>
      <span className="price-value__unit">{unit}</span>
    </span>
  );
}

export function formatSignedPriceText(value: number | string | null, unit: '원/L' | '원' = '원'): string {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return '기록 없음';
  }

  return `${formatSignedNumber(parsed)}${unit}`;
}

export function formatDirectionalPriceChange(
  direction: DashboardTrendDirection,
  value: number | string | null,
  unit: '원/L' | '원' = '원',
): string {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return '기록 없음';
  }

  const magnitude = Math.abs(parsed);
  if (direction === 'down') {
    return `-${formatPriceNumber(magnitude)}${unit}`;
  }

  if (direction === 'up') {
    return `+${formatPriceNumber(magnitude)}${unit}`;
  }

  return `${formatPriceNumber(magnitude)}${unit}`;
}

export function formatSignedRatioText(value: number | string | null): string {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return '기록 없음';
  }

  const percent = parsed * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${SIGNED_PERCENT_FORMATTER.format(percent)}%`;
}

export function formatRateLabel(value: number | string): string {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return 'N/A';
  }

  const percent = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return `${SIGNED_PERCENT_FORMATTER.format(percent).replace(/\.00$/, '')}%`;
}

export function formatDisplayDate(value: string | null, fallback = '기준일 없음'): string {
  return formatDotDate(value) ?? fallback;
}

export function formatDisplayDateTime(value: string | null, fallback = '갱신 시각 없음'): string {
  return formatDotDateTime(value) ?? fallback;
}

export function formatWeekRange(week: FscDashboardWeekItem, compact = false): string {
  const storedStartDate = new Date(week.weekStartDate);

  if (Number.isNaN(storedStartDate.getTime())) {
    return '기간 없음';
  }

  const fullWeekStart = getOpinetWeekStart(storedStartDate);
  const fullWeekEnd = getOpinetWeekEnd(fullWeekStart);
  const startText = formatDotDate(fullWeekStart.toISOString());
  const endText = formatDotDate(fullWeekEnd.toISOString());

  if (startText === null || endText === null) {
    return '기간 없음';
  }

  if (!compact) {
    return `${startText}–${endText}`;
  }

  const [, startMonth, startDay] = startText.split('.');
  const [, endMonth, endDay] = endText.split('.');
  return `${Number(startMonth)}.${Number(startDay)}–${Number(endMonth)}.${Number(endDay)}`;
}

export function formatSequenceWeekLabel(sequenceNo: number): string {
  return `${sequenceNo}주`;
}

export function mapApprovalStatus(value: string): { label: string; tone: StatusTone } {
  switch (value) {
    case 'approved':
      return { label: '승인 완료', tone: 'ok' };
    case 'rejected':
      return { label: '반려', tone: 'critical' };
    case 'pending':
    default:
      return { label: '승인 대기', tone: 'warning' };
  }
}

export function mapFreshnessStatus(value: string): { label: string; tone: StatusTone } {
  switch (value) {
    case 'fresh':
      return { label: '데이터 최신', tone: 'ok' };
    case 'delayed':
      return { label: '데이터 지연', tone: 'warning' };
    case 'stale':
      return { label: '데이터 오래됨', tone: 'critical' };
    case 'unavailable':
    default:
      return { label: '데이터 확인 필요', tone: 'critical' };
  }
}

function mapReliabilityTone(grade: string): StatusTone {
  if (grade === 'A+' || grade === 'A' || grade === 'B') {
    return 'ok';
  }

  if (grade === 'C') {
    return 'warning';
  }

  return 'critical';
}

export function mapReliabilityStatus(input: ReliabilityStatusInput): ReliabilityStatusView {
  const {
    grade,
    sampleCount,
    minimumSampleCount,
    recent13wWeeklyPriceMape,
  } = input;

  if (sampleCount === 0) {
    return {
      label: '신뢰도 산정 전',
      detail: '비교 가능한 완료 예측이 아직 없습니다.',
      tone: 'neutral',
    };
  }

  if (sampleCount < minimumSampleCount || grade === 'U' || recent13wWeeklyPriceMape === null) {
    return {
      label: `신뢰도 산정 중 · ${sampleCount}/${minimumSampleCount}`,
      detail: `공식 신뢰도 등급은 주간 백테스트 ${minimumSampleCount}개가 확보된 후 산정합니다. 현재 ${sampleCount}개가 확보되었습니다.`,
      tone: 'neutral',
    };
  }

  const mape = parseNumeric(recent13wWeeklyPriceMape);

  if (mape === null) {
    return {
      label: `신뢰도 산정 중 · ${sampleCount}/${minimumSampleCount}`,
      detail: `공식 신뢰도 등급은 주간 백테스트 ${minimumSampleCount}개가 확보된 후 산정합니다.`,
      tone: 'neutral',
    };
  }

  return {
    label: `신뢰도 ${grade} · MAPE ${mape.toFixed(1)}%`,
    detail: `최근 ${minimumSampleCount}주 MAPE 기본 등급에 최근 4주 오차 추세, 최근 26주 안정성, 데이터 최신성을 반영한 등급입니다.`,
    tone: mapReliabilityTone(grade),
  };
}

export function mapForecastSourceKind(value: FscDashboardWeekItem['forecastSourceKind']): string {
  switch (value) {
    case 'weekly_point':
      return '주간 예측값';
    case 'weekly_trend_extension':
      return '주간 추세 연장값';
    case null:
    default:
      return '실제값 반영';
  }
}

export function mapWeekKind(value: FscDashboardWeekItem['priceKind']): string {
  return value === 'actual' ? 'Actual' : 'Forecast';
}

export function mapDirectionLabel(value: DashboardTrendDirection): string {
  switch (value) {
    case 'up':
      return '상승';
    case 'down':
      return '하락';
    case 'flat':
    default:
      return '보합';
  }
}

export function getFirstForecastIndex(weeks: readonly FscDashboardWeekItem[]): number {
  return weeks.findIndex((week) => week.priceKind === 'forecast');
}

export function splitWeekKinds(weeks: readonly FscDashboardWeekItem[]): {
  actualWeeks: FscDashboardWeekItem[];
  forecastWeeks: FscDashboardWeekItem[];
} {
  return {
    actualWeeks: weeks.filter((week) => week.priceKind === 'actual'),
    forecastWeeks: weeks.filter((week) => week.priceKind === 'forecast'),
  };
}
