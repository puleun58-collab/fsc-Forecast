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

  return (
    <section className="market-reference surface-panel" aria-labelledby="market-reference-title">
      <div className="panel-header panel-header--inline">
        <div>
          <h2 id="market-reference-title">오피넷 시장 참고값</h2>
          <p>FSC 판단의 보조 지표이며, 주요 산출 결과보다 낮은 우선순위로 표시합니다.</p>
        </div>
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
            <p className={`directional-value directional-value--${current.direction}`}>
              전일 대비 {mapDirectionLabel(current.direction)}{' '}
              {formatDirectionalPriceChange(current.direction, current.absoluteChangeKrwPerL)} ·{' '}
              {formatPercentText(current.percentChange)}
            </p>
            <span className="metric-caption">수집 시각 {formatDisplayDateTime(current.sourceObservedAt)}</span>
          </div>
          <ForecastChangeSummary
            forecastChange={forecastChange}
            marketSignals={support.marketSignals.signals}
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
      className={`forecast-change-summary forecast-change-summary--${direction}`}
      aria-labelledby="forecast-change-summary-title"
    >
      <strong id="forecast-change-summary-title" className="forecast-change-summary__title">
        이번 주 전망 변화
      </strong>
      <div className="forecast-change-summary__change">
        <span className="forecast-change-summary__eyebrow">지난 전망 대비</span>
        <p
          className={`forecast-change-summary__delta directional-value directional-value--${direction}`}
          aria-label={`지난 전망 대비 ${changeValue}`}
        >
          {changeValue}
        </p>
      </div>
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
          <span
            className={`market-signal-card__change directional-value directional-value--${signal.direction}`}
          >
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
