import type { DashboardTrendDirection } from './fsc-types';

export type PublicMarketIndicatorCode = 'dubai' | 'usd-krw';

export type PublicMarketSignal = {
  indicatorCode: PublicMarketIndicatorCode;
  displayName: string;
  observedAt: string | null;
  previousObservedAt: string | null;
  value: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: DashboardTrendDirection;
  explanation: string;
};

export const PUBLIC_MARKET_INDICATORS = new Set<PublicMarketIndicatorCode>(['dubai', 'usd-krw']);

const PUBLIC_MARKET_SIGNAL_META: Record<
  PublicMarketIndicatorCode,
  { displayName: string; explanation: string }
> = {
  dubai: {
    displayName: '두바이유',
    explanation: '아시아 지역으로 공급되는 중동산 원유가격 흐름을 대표하는 원유 원가 참고 지표',
  },
  'usd-krw': {
    displayName: 'USD/KRW',
    explanation: '달러 표시 원유와 석유제품 가격을 원화로 환산할 때 영향을 주는 환율 지표',
  },
};

export type MarketSignalHistoryInput = {
  indicatorCode: string;
  rows: Array<{
    observedAt: Date;
    value: number;
  }>;
};

export function calculatePercentChange(
  currentValue: number | null,
  previousValue: number | null,
): number | null {
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

export function calculateDirection(
  absoluteChange: number | null,
): DashboardTrendDirection {
  if (absoluteChange === null || absoluteChange === 0) {
    return 'flat';
  }

  return absoluteChange > 0 ? 'up' : 'down';
}

export function buildPublicMarketSignals(
  allSignals: readonly MarketSignalHistoryInput[],
): PublicMarketSignal[] {
  return allSignals.flatMap((signal): PublicMarketSignal[] => {
    if (!PUBLIC_MARKET_INDICATORS.has(signal.indicatorCode as PublicMarketIndicatorCode)) {
      return [];
    }

    const indicatorCode = signal.indicatorCode as PublicMarketIndicatorCode;
    const latestRow = signal.rows[0] ?? null;
    const previousRow = signal.rows[1] ?? null;
    const currentValue = latestRow?.value ?? null;
    const previousValue = previousRow?.value ?? null;
    const absoluteChange =
      currentValue === null || previousValue === null ? null : currentValue - previousValue;
    const percentChange = calculatePercentChange(currentValue, previousValue);

    return [
      {
        indicatorCode,
        displayName: PUBLIC_MARKET_SIGNAL_META[indicatorCode].displayName,
        observedAt: latestRow?.observedAt.toISOString() ?? null,
        previousObservedAt: previousRow?.observedAt.toISOString() ?? null,
        value: currentValue,
        previousValue,
        absoluteChange,
        percentChange,
        direction: calculateDirection(absoluteChange),
        explanation: PUBLIC_MARKET_SIGNAL_META[indicatorCode].explanation,
      },
    ];
  });
}

function describeDirection(direction: DashboardTrendDirection): '상승' | '하락' | '보합' {
  switch (direction) {
    case 'up':
      return '상승';
    case 'down':
      return '하락';
    case 'flat':
    default:
      return '보합';
  }
}

export function buildPublicMarketSummaryText(
  signals: readonly PublicMarketSignal[],
): string {
  const dubai = signals.find((signal) => signal.indicatorCode === 'dubai');
  const usdKrw = signals.find((signal) => signal.indicatorCode === 'usd-krw');

  if (!dubai || !usdKrw) {
    return '두바이유와 원/달러 환율 관측값이 모두 갖춰진 뒤 핵심 시장 요인을 안내합니다.';
  }

  if (dubai.direction === 'down' && usdKrw.direction === 'down') {
    return '두바이유와 원/달러 환율이 모두 하락해 국내 경유가격에는 하방 요인으로 작용하고 있습니다.';
  }

  if (dubai.direction === 'up' && usdKrw.direction === 'up') {
    return '두바이유와 원/달러 환율이 함께 상승해 국내 경유가격에는 상방 요인으로 작용하고 있습니다.';
  }

  if (dubai.direction === 'up' && usdKrw.direction === 'down') {
    return '두바이유는 상승했으나 원/달러 환율은 하락해 원유가격 상승 압력을 환율 하락이 일부 상쇄하고 있습니다.';
  }

  if (dubai.direction === 'down' && usdKrw.direction === 'up') {
    return '두바이유는 하락했으나 원/달러 환율은 상승해 원가 하락 요인을 환율 상승이 일부 상쇄하고 있습니다.';
  }

  if (dubai.direction === 'flat' && usdKrw.direction === 'flat') {
    return '두바이유와 원/달러 환율이 모두 큰 변동 없이 보합권에 머물고 있습니다.';
  }

  if (dubai.direction === 'flat') {
    return `두바이유는 보합이고 원/달러 환율은 ${describeDirection(usdKrw.direction)}해 환율 요인이 상대적으로 두드러집니다.`;
  }

  if (usdKrw.direction === 'flat') {
    return `원/달러 환율은 보합이고 두바이유는 ${describeDirection(dubai.direction)}해 원유가격 요인이 상대적으로 두드러집니다.`;
  }

  return '두바이유와 원/달러 환율 신호를 함께 참고해 국내 경유가격 방향을 해석합니다.';
}
