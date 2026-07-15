import { formatDotDate, formatDotDateTime, formatPriceNumber } from '@/lib/dashboard/display-format';

import type { DashboardTrendDirection, FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

export type StatusTone = 'ok' | 'warning' | 'critical' | 'neutral';

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
  const startText = formatDotDate(week.weekStartDate);
  const endText = formatDotDate(week.weekEndDate);

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

export function mapReliabilityGrade(value: string): { label: string; detail: string; tone: StatusTone } {
  if (value === 'U') {
    return {
      label: '신뢰도 산정 전',
      detail: '원본 등급 U. 최근 오차 지표가 충분히 쌓이면 신뢰도 등급을 산정합니다.',
      tone: 'neutral',
    };
  }

  return {
    label: `신뢰도 ${value}`,
    detail: `원본 등급 ${value}. 최근 예측 오차 지표를 기준으로 산정합니다.`,
    tone: 'ok',
  };
}

export function mapForecastSourceKind(value: FscDashboardWeekItem['forecastSourceKind']): string {
  switch (value) {
    case 'weekly_point':
      return '주간 예측값';
    case 'monthly_point':
      return '월간 예측값';
    case 'carry_forward':
      return '직전 예측값 유지';
    case 'applied_price_fallback':
      return '현재 적용유가 대체';
    case 'base_price_fallback':
      return '기준유가 대체';
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
