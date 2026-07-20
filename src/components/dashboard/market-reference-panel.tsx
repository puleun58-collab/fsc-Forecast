import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDirectionalPriceChange,
  mapDirectionLabel,
  parseNumeric,
  PriceValue,
} from './dashboard-format';

import type {
  FscDashboardMarketSignal,
  FscDashboardSupportSection,
  FscDashboardTrendPoint,
} from '@/lib/dashboard/fsc-types';
import { formatPercentText, formatPriceText } from '@/lib/dashboard/display-format';

type MarketReferencePanelProps = {
  support: FscDashboardSupportSection;
};

type MarketSparklineProps = {
  points: readonly FscDashboardTrendPoint[];
  latestWeeklyAverageKrwPerL: number | null;
  latestMonthlyAverageKrwPerL: number | null;
};

export function MarketReferencePanel({ support }: MarketReferencePanelProps) {
  const current = support.currentPrice;
  const trend = support.trend;

  return (
    <section className="market-reference surface-panel" aria-labelledby="market-reference-title">
      <div className="panel-header panel-header--inline">
        <div>
          <h2 id="market-reference-title">오피넷 시장 참고값</h2>
          <p>FSC 판단의 보조 지표이며, 주요 산출 결과보다 낮은 우선순위로 표시합니다.</p>
        </div>
        <span className="market-reference__source">출처: 오피넷</span>
      </div>
      {current.availability === 'available' ? (
        <div className="market-reference__grid">
          <div className="market-reference__latest">
            <span className="metric-label">
              {current.latestPriceDate === null
                ? '최종 평균 경유가'
                : `${formatDisplayDate(current.latestPriceDate)} 최종 평균 경유가`}
            </span>
            <PriceValue value={current.latestPriceKrwPerL} size="scenario" />
            <p>
              전일 대비 {mapDirectionLabel(current.direction)}{' '}
              {formatDirectionalPriceChange(current.direction, current.absoluteChangeKrwPerL)} ·{' '}
              {formatPercentText(current.percentChange)}
            </p>
            <span className="metric-caption">수집 시각 {formatDisplayDateTime(current.sourceObservedAt)}</span>
          </div>
          <div className="market-reference__facts" aria-label="시장 참고 요약">
            <MarketFact label="최신 주간 평균" value={formatPriceText(trend.latestWeeklyAverageKrwPerL)} />
            <MarketFact label="최신 월간 평균" value={formatPriceText(trend.latestMonthlyAverageKrwPerL)} />
            <MarketFact
              label="커버리지"
              value={`${formatDisplayDate(current.coverageStartDate)}–${formatDisplayDate(current.coverageEndDate)}`}
            />
          </div>
          <MarketSparkline
            points={trend.points}
            latestWeeklyAverageKrwPerL={trend.latestWeeklyAverageKrwPerL}
            latestMonthlyAverageKrwPerL={trend.latestMonthlyAverageKrwPerL}
          />
          <MarketSignalsSection support={support} />
        </div>
      ) : (
        <div className="empty-state" role="status">
          <strong>오피넷 현재 유가를 불러오지 못했습니다.</strong>
          <span>{current.unavailableReason ?? '시장 참고값을 사용할 수 없습니다.'}</span>
        </div>
      )}
    </section>
  );
}

function MarketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="market-reference__fact">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MarketSignalsSection({ support }: { support: FscDashboardSupportSection }) {
  const marketSignals = support.marketSignals;

  return (
    <div className="market-signals">
      <div className="market-signals__heading">
        <strong>주요 시장 요인</strong>
        <span>두바이유와 USD/KRW의 최신 일별 유효 관측값을 표시합니다.</span>
      </div>
      {marketSignals.signals.length > 0 ? (
        <div className="market-signals__grid" aria-label="공개 시장 요인">
          {marketSignals.signals.map((signal) => (
            <MarketSignalCard key={signal.indicatorCode} signal={signal} />
          ))}
        </div>
      ) : null}
      <p>{marketSignals.summaryText}</p>
      {marketSignals.status !== 'ready' && marketSignals.unavailableReason ? (
        <span className="metric-caption">{marketSignals.unavailableReason}</span>
      ) : null}
    </div>
  );
}

function MarketSignalCard({ signal }: { signal: FscDashboardMarketSignal }) {
  const hasComparison =
    signal.value !== null &&
    signal.previousValue !== null &&
    signal.absoluteChange !== null &&
    signal.percentChange !== null;

  return (
    <article className="market-signal-card" title={signal.explanation}>
      <span className="metric-label">{signal.displayName}</span>
      {hasComparison ? (
        <>
          <strong className="market-signal-card__value">{formatMarketSignalValue(signal)}</strong>
          <span className="market-signal-card__change">
            전일 대비 {formatMarketSignalChange(signal)} ({formatPercentText(signal.percentChange)}) ·{' '}
            {mapDirectionLabel(signal.direction)}
          </span>
          <span className="metric-caption">관측 기준 {formatDisplayDate(signal.latestObservationDate)}</span>
        </>
      ) : (
        <strong>유효한 일별 관측값이 부족합니다.</strong>
      )}
      <span className="metric-caption">
        {signal.providerName} · {signal.valueBasisLabel}
      </span>
      {signal.status === 'checking' ? (
        <span className="market-signal-card__checking" role="status">
          최신 데이터 확인 중
        </span>
      ) : null}
    </article>
  );
}

function formatMarketSignalValue(signal: FscDashboardMarketSignal): string {
  if (signal.value === null) {
    return '기록 없음';
  }

  const valueText = signal.value.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return signal.indicatorCode === 'dubai' ? `${valueText} USD/BBL` : `${valueText}원/USD`;
}

function formatMarketSignalChange(signal: FscDashboardMarketSignal): string {
  if (signal.absoluteChange === null) {
    return '산정 불가';
  }

  const amountText = Math.abs(signal.absoluteChange).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const signedAmount = `${signal.absoluteChange > 0 ? '+' : signal.absoluteChange < 0 ? '-' : ''}${amountText}`;

  return signal.indicatorCode === 'dubai' ? signedAmount : `${signedAmount}원`;
}

export function MarketSparkline({
  points,
  latestWeeklyAverageKrwPerL,
  latestMonthlyAverageKrwPerL,
}: MarketSparklineProps) {
  const validPoints = points.filter((point) => Number.isFinite(point.priceKrwPerL));

  if (validPoints.length < 2) {
    return (
      <div className="market-sparkline market-sparkline--empty" role="status">
        추이 데이터 부족
      </div>
    );
  }

  const width = 360;
  const height = 104;
  const minMaxValues = [
    ...validPoints.map((point) => point.priceKrwPerL),
    ...[latestWeeklyAverageKrwPerL, latestMonthlyAverageKrwPerL].map(parseNumeric).filter((value): value is number => value !== null),
  ];
  const minValue = Math.min(...minMaxValues);
  const maxValue = Math.max(...minMaxValues);
  const spread = Math.max(maxValue - minValue, 1);
  const padding = Math.max(spread * 0.16, 12);
  const min = minValue - padding;
  const max = maxValue + padding;
  const xStep = width / (validPoints.length - 1);
  const polyline = validPoints
    .map((point, index) => {
      const x = xStep * index;
      const y = height - ((point.priceKrwPerL - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="market-sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 오피넷 일별 가격 sparkline">
        <polyline points={polyline} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <span>최근 {validPoints.length}일 추이</span>
    </div>
  );
}
