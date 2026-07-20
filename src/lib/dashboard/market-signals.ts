import type { IndicatorRefreshStatus } from '../external-indicators/indicator-sync-state';
import type { DashboardTrendDirection } from './fsc-types';

export type PublicMarketIndicatorCode = 'dubai' | 'usd-krw';
export type PublicMarketSignalStatus = 'ready' | 'checking' | 'unavailable';

type SourcePayload = {
  provider: string;
  frequency: 'daily';
  unit: 'usd_per_barrel' | 'krw_per_usd';
  valueBasis: string;
  sourceUrl: string;
  seriesId?: string;
};

export type PublicMarketSignal = {
  indicatorCode: PublicMarketIndicatorCode;
  displayName: string;
  status: PublicMarketSignalStatus;
  latestObservationDate: string | null;
  collectedAt: string | null;
  previousObservationDate: string | null;
  value: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: DashboardTrendDirection;
  unitLabel: 'USD/BBL' | '원/USD';
  valueBasisLabel: string;
  providerName: string;
  sourceUrl: string;
  explanation: string;
};

export const PUBLIC_MARKET_INDICATORS = new Set<PublicMarketIndicatorCode>(['dubai', 'usd-krw']);

const PUBLIC_MARKET_SIGNAL_META: Record<
  PublicMarketIndicatorCode,
  {
    displayName: string;
    unitLabel: PublicMarketSignal['unitLabel'];
    valueBasisLabel: string;
    providerName: string;
    explanation: string;
  }
> = {
  dubai: {
    displayName: '두바이유',
    unitLabel: 'USD/BBL',
    valueBasisLabel: 'Dubai 현물가격 추정값 기준',
    providerName: '한국석유공사 오피넷',
    explanation: '싱가포르에서 거래된 Dubai 현물가격 추정값을 한국석유공사 오피넷이 일별로 제공합니다.',
  },
  'usd-krw': {
    displayName: 'USD/KRW',
    unitLabel: '원/USD',
    valueBasisLabel: '뉴욕 정오 매입환율 기준',
    providerName: 'FRED',
    explanation: '미 연준 계열 원/달러 환율의 뉴욕 정오 매입환율 일별 관측값입니다.',
  },
};

export type MarketSignalHistoryInput = {
  indicatorCode: string;
  syncStatus?: IndicatorRefreshStatus | null;
  rows: Array<{
    observedAt: Date;
    collectedAt: Date;
    value: number;
    sourcePayload: unknown;
  }>;
};

function parseSourcePayload(
  indicatorCode: PublicMarketIndicatorCode,
  value: unknown,
): SourcePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<SourcePayload>;
  const expectedProvider = indicatorCode === 'dubai' ? 'opinet-dubai-daily' : 'fred-public-csv';
  const expectedUnit = indicatorCode === 'dubai' ? 'usd_per_barrel' : 'krw_per_usd';
  const validSeries = indicatorCode === 'dubai' || candidate.seriesId === 'DEXKOUS';
  const expectedBasis =
    indicatorCode === 'dubai' ? 'dubai_spot_estimate' : 'new_york_noon_buying_rate';

  if (
    candidate.provider !== expectedProvider ||
    candidate.frequency !== 'daily' ||
    candidate.unit !== expectedUnit ||
    candidate.valueBasis !== expectedBasis ||
    typeof candidate.sourceUrl !== 'string' ||
    candidate.sourceUrl.trim().length === 0 ||
    !validSeries
  ) {
    return null;
  }

  return candidate as SourcePayload;
}

export function calculatePercentChange(
  currentValue: number | null,
  previousValue: number | null,
): number | null {
  if (currentValue === null || previousValue === null || previousValue <= 0) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

export function calculateDirection(absoluteChange: number | null): DashboardTrendDirection {
  if (absoluteChange === null || absoluteChange === 0) {
    return 'flat';
  }

  return absoluteChange > 0 ? 'up' : 'down';
}

function selectLatestTwoValidRows(
  indicatorCode: PublicMarketIndicatorCode,
  rows: MarketSignalHistoryInput['rows'],
): Array<MarketSignalHistoryInput['rows'][number] & { source: SourcePayload }> {
  const rowsByDate = new Map<string, MarketSignalHistoryInput['rows'][number] & { source: SourcePayload }>();

  for (const row of rows) {
    const source = parseSourcePayload(indicatorCode, row.sourcePayload);

    if (!source || Number.isNaN(row.observedAt.getTime()) || !Number.isFinite(row.value) || row.value <= 0) {
      continue;
    }

    const dateKey = row.observedAt.toISOString().slice(0, 10);
    const existing = rowsByDate.get(dateKey);

    if (!existing || row.collectedAt > existing.collectedAt) {
      rowsByDate.set(dateKey, { ...row, source });
    }
  }

  return [...rowsByDate.values()]
    .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())
    .slice(0, 2);
}

export function buildPublicMarketSignals(
  allSignals: readonly MarketSignalHistoryInput[],
): PublicMarketSignal[] {
  return allSignals.flatMap((signal): PublicMarketSignal[] => {
    if (!PUBLIC_MARKET_INDICATORS.has(signal.indicatorCode as PublicMarketIndicatorCode)) {
      return [];
    }

    const indicatorCode = signal.indicatorCode as PublicMarketIndicatorCode;
    const rows = selectLatestTwoValidRows(indicatorCode, signal.rows);
    const latestRow = rows[0] ?? null;
    const previousRow = rows[1] ?? null;
    const currentValue = latestRow?.value ?? null;
    const previousValue = previousRow?.value ?? null;
    const absoluteChange =
      currentValue === null || previousValue === null
        ? null
        : Math.round((currentValue - previousValue) * 10_000) / 10_000;
    const percentChange = calculatePercentChange(currentValue, previousValue);
    const status: PublicMarketSignalStatus =
      !latestRow || !previousRow
        ? 'unavailable'
        : signal.syncStatus === 'failed' || signal.syncStatus === 'checking'
          ? 'checking'
          : 'ready';
    const meta = PUBLIC_MARKET_SIGNAL_META[indicatorCode];

    return [
      {
        indicatorCode,
        displayName: meta.displayName,
        status,
        latestObservationDate: latestRow?.observedAt.toISOString() ?? null,
        collectedAt: latestRow?.collectedAt.toISOString() ?? null,
        previousObservationDate: previousRow?.observedAt.toISOString() ?? null,
        value: currentValue,
        previousValue,
        absoluteChange,
        percentChange,
        direction: calculateDirection(absoluteChange),
        unitLabel: meta.unitLabel,
        valueBasisLabel: meta.valueBasisLabel,
        providerName: meta.providerName,
        sourceUrl: latestRow?.source.sourceUrl ?? '',
        explanation: meta.explanation,
      },
    ];
  });
}

export function buildPublicMarketSummaryText(signals: readonly PublicMarketSignal[]): string {
  const dubai = signals.find((signal) => signal.indicatorCode === 'dubai');
  const usdKrw = signals.find((signal) => signal.indicatorCode === 'usd-krw');

  if (!dubai || !usdKrw || dubai.status !== 'ready' || usdKrw.status !== 'ready') {
    return '시장 영향 판단 보류';
  }

  if (dubai.direction === 'flat' && usdKrw.direction === 'flat') {
    return '두 지표 모두 보합으로 국내 경유가격의 단기 영향은 중립';
  }

  if (dubai.direction === 'flat') {
    return usdKrw.direction === 'up'
      ? '국내 경유가격의 단기 상승 요인'
      : '국내 경유가격의 단기 하락 요인';
  }

  if (usdKrw.direction === 'flat') {
    return dubai.direction === 'up'
      ? '국내 경유가격의 단기 상승 요인'
      : '국내 경유가격의 단기 하락 요인';
  }

  if (dubai.direction === 'up' && usdKrw.direction === 'up') {
    return '국내 경유가격의 단기 상승 요인';
  }

  if (dubai.direction === 'down' && usdKrw.direction === 'down') {
    return '국내 경유가격의 단기 하락 요인';
  }

  return '상승·하락 요인이 혼재';
}
