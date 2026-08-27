import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDirectionalPriceChange,
  mapDirectionLabel,
  PriceValue,
} from './dashboard-format';

import type {
  FscDashboardForecastChangeSection,
  FscDashboardMarketSignal,
  FscDashboardSupportSection,
} from '@/lib/dashboard/fsc-types';
import { formatPercentText, formatPriceNumber } from '@/lib/dashboard/display-format';

type MarketReferencePanelProps = {
  support: FscDashboardSupportSection;
  forecastChange?: FscDashboardForecastChangeSection;
};

export function MarketReferencePanel({ support, forecastChange }: MarketReferencePanelProps) {
  const current = support.currentPrice;
  const marketSignals = support.marketSignals;
  const orderedMarketSignals = (['dubai', 'usd-krw'] as const)
    .map((indicatorCode) =>
      marketSignals.signals.find((signal) => signal.indicatorCode === indicatorCode),
    )
    .filter((signal): signal is FscDashboardMarketSignal => signal !== undefined);

  return (
    <section className="market-reference surface-panel" aria-labelledby="market-reference-title">
      <div className="panel-header panel-header--inline">
        <div>
          <h2 id="market-reference-title">유가·시장 참고 지표</h2>
          <p>국내 일일 평균 경유가와 전망 변화, 두바이유·환율 흐름을 함께 표시합니다.</p>
        </div>
      </div>
      {current.availability === 'available' ? (
        <>
          <div className="market-reference__grid" aria-label="유가 및 시장 참고 지표 카드">
            <article className="market-reference-card market-reference__latest">
              <strong className="market-reference-card__title">일일 평균 경유가</strong>
              <span className="market-reference-card__context">
                {current.latestPriceDate === null
                  ? '기준일 확인 중'
                  : `${formatDisplayDate(current.latestPriceDate)} 기준`}
              </span>
              <PriceValue value={current.latestPriceKrwPerL} size="scenario" />
              <p className={`directional-value directional-value--${current.direction}`}>
                전일 대비{' '}
                {formatDirectionalPriceChange(current.direction, current.absoluteChangeKrwPerL)} ·{' '}
                {formatPercentText(current.percentChange)} · {mapDirectionLabel(current.direction)}
              </p>
              <span className="market-reference-card__footer metric-caption">
                수집 시각 {formatDisplayDateTime(current.sourceObservedAt)}
              </span>
            </article>
            <ForecastChangeSummary
              forecastChange={forecastChange}
              marketSignals={marketSignals.signals}
            />
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
          <strong>오피넷 현재 유가를 불러오지 못했습니다.</strong>
          <span>{current.unavailableReason ?? '시장 참고값을 사용할 수 없습니다.'}</span>
        </div>
      )}
    </section>
  );
}

function ForecastChangeSummary({
  forecastChange,
  marketSignals,
}: {
  forecastChange?: FscDashboardForecastChangeSection;
  marketSignals: readonly FscDashboardMarketSignal[];
}) {
  const direction = forecastChange?.direction ?? 'flat';
  const dubai = marketSignals.find((signal) => signal.indicatorCode === 'dubai');
  const usdKrw = marketSignals.find((signal) => signal.indicatorCode === 'usd-krw');
  const newActualText =
    forecastChange?.comparisonStatus !== 'available'
      ? '비교 데이터 없음'
      : forecastChange.newActualWeekLabel === null
        ? '반영 없음'
        : forecastChange.newActualWeekCount > 1
          ? `${forecastChange.newActualWeekLabel} 외 ${forecastChange.newActualWeekCount - 1}건`
          : forecastChange.newActualWeekLabel;
  const changeValue = formatForecastChangeValue(forecastChange);

  return (
    <section
      className={`market-reference-card forecast-change-summary forecast-change-summary--${direction}`}
      aria-labelledby="forecast-change-summary-title"
    >
      <strong
        id="forecast-change-summary-title"
        className="market-reference-card__title forecast-change-summary__title"
      >
        이번 주 전망 변화
      </strong>
      <span className="market-reference-card__context forecast-change-summary__eyebrow">
        지난 전망 대비
      </span>
      <p
        className={`forecast-change-summary__delta directional-value directional-value--${direction}`}
        aria-label={`지난 전망 대비 ${changeValue}`}
      >
        {changeValue}
      </p>
      <p className="forecast-change-summary__reason">
        {forecastChange?.summaryText ?? '지난 전망과 비교할 데이터가 없습니다.'}
      </p>
      <dl className="forecast-change-summary__details">
        <ForecastChangeFact label="두바이유" signal={dubai} />
        <ForecastChangeFact label="USD/KRW" signal={usdKrw} />
        <div>
          <dt>신규 Actual 값</dt>
          <dd>{newActualText}</dd>
        </div>
      </dl>
    </section>
  );
}

function ForecastChangeFact({
  label,
  signal,
}: {
  label: string;
  signal: FscDashboardMarketSignal | undefined;
}) {
  const direction = signal?.direction ?? 'flat';

  return (
    <div>
      <dt>{label}</dt>
      <dd className={`directional-value directional-value--${direction}`}>
        {formatForecastSignal(signal)}
      </dd>
    </div>
  );
}

function formatForecastChangeValue(change: FscDashboardForecastChangeSection | undefined): string {
  if (change?.comparisonStatus !== 'available' || change.absoluteChangeKrwPerL === null) {
    return '비교 데이터 없음';
  }

  const sign = change.absoluteChangeKrwPerL > 0 ? '+' : '';
  const icon = change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '→';
  return `${sign}${formatPriceNumber(change.absoluteChangeKrwPerL)}원/L ${icon}`;
}

function formatForecastSignal(signal: FscDashboardMarketSignal | undefined): string {
  if (
    signal?.status !== 'ready' ||
    signal.percentChange === null ||
    signal.percentChange === undefined
  ) {
    return '비교 데이터 없음';
  }

  const icon = signal.direction === 'up' ? '↑' : signal.direction === 'down' ? '↓' : '→';
  return `${formatPercentText(signal.percentChange)} ${icon}`;
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
