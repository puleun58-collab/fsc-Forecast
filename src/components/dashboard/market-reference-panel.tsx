import {
  formatDisplayDate,
  mapDirectionLabel,
} from './dashboard-format';

import type {
  FscDashboardMarketSignal,
  FscDashboardSupportSection,
} from '@/lib/dashboard/fsc-types';
import { formatPercentText } from '@/lib/dashboard/display-format';

type MarketReferencePanelProps = {
  support: FscDashboardSupportSection;
};

export function MarketReferencePanel({ support }: MarketReferencePanelProps) {
  const marketSignals = support.marketSignals;
  const orderedMarketSignals = (['dubai', 'usd-krw'] as const).flatMap((indicatorCode) => {
    const signal = marketSignals.signals.find((candidate) => candidate.indicatorCode === indicatorCode);
    return signal ? [signal] : [];
  });

  return (
    <section className="market-reference surface-panel" aria-labelledby="market-reference-title">
      <div className="panel-header">
        <h2 id="market-reference-title">시장 참고 지표</h2>
        <p>두바이유와 환율의 최신 흐름을 표시합니다.</p>
      </div>
      {orderedMarketSignals.length > 0 ? (
        <>
          <div className="market-reference__grid" aria-label="시장 참고 지표 카드">
            {orderedMarketSignals.map((signal) => (
              <MarketSignalCard key={signal.indicatorCode} signal={signal} />
            ))}
          </div>
          {marketSignals.summaryText ? (
            <p className="market-reference__summary">{marketSignals.summaryText}</p>
          ) : null}
          {marketSignals.status !== 'ready' && marketSignals.unavailableReason ? (
            <span className="market-reference__status metric-caption">
              {marketSignals.unavailableReason}
            </span>
          ) : null}
        </>
      ) : (
        <div className="empty-state" role="status">
          <strong>시장 참고 지표를 불러오지 못했습니다.</strong>
          <span>{marketSignals.unavailableReason ?? '두바이유와 환율을 확인하고 있습니다.'}</span>
        </div>
      )}
    </section>
  );
}

function MarketSignalCard({ signal }: { signal: FscDashboardMarketSignal }) {
  const hasComparison =
    signal.value !== null &&
    signal.previousValue !== null &&
    signal.absoluteChange !== null &&
    signal.percentChange !== null;

  return (
    <article
      className="market-reference-card market-signal-card"
      title={signal.explanation}
    >
      <strong className="market-reference-card__title">{signal.displayName}</strong>
      {hasComparison ? (
        <>
          <span className="market-reference-card__context">
            {formatDisplayDate(signal.latestObservationDate)} 관측
          </span>
          <strong className="market-signal-card__value">{formatMarketSignalValue(signal)}</strong>
          <span
            className={`market-signal-card__change directional-value directional-value--${signal.direction}`}
          >
            전일 대비 {formatMarketSignalChange(signal)} ({formatPercentText(signal.percentChange)}) ·{' '}
            {mapDirectionLabel(signal.direction)}
          </span>
        </>
      ) : (
        <>
          <span className="market-reference-card__context">관측 기준 확인 중</span>
          <strong>유효한 일별 관측값이 부족합니다.</strong>
        </>
      )}
      <span className="market-reference-card__footer metric-caption">
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
