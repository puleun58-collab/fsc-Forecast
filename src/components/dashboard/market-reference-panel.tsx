import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDirectionalPriceChange,
  mapDirectionLabel,
  parseNumeric,
  PriceValue,
} from './dashboard-format';

import type {
  FscDashboardCommentarySignal,
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
            <span className="metric-label">최신 전국 평균 경유가</span>
            <PriceValue value={current.latestPriceKrwPerL} size="scenario" />
            <p>
              전일 대비 {mapDirectionLabel(current.direction)}{' '}
              {formatDirectionalPriceChange(current.direction, current.absoluteChangeKrwPerL)} ·{' '}
              {formatPercentText(current.percentChange)}
            </p>
            <span className="metric-caption">
              기준일 {formatDisplayDate(current.latestPriceDate)} · {formatDisplayDateTime(current.sourceObservedAt)}
            </span>
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
          <MarketCommentary text={support.commentary.text} signals={support.commentary.signals} />
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

function MarketCommentary({
  text,
  signals,
}: {
  text: string;
  signals: readonly FscDashboardCommentarySignal[];
}) {
  if (text.length === 0 && signals.length === 0) {
    return null;
  }

  const evidenceMarker = '주요 근거는 ';
  const evidenceTerminator = '입니다.';
  const evidenceStartIndex = text.indexOf(evidenceMarker);
  const evidenceEndIndex =
    evidenceStartIndex >= 0 ? text.indexOf(evidenceTerminator, evidenceStartIndex) : -1;
  const evidenceText =
    evidenceEndIndex >= 0 ? text.slice(evidenceStartIndex, evidenceEndIndex + evidenceTerminator.length) : null;
  const beforeEvidenceText = evidenceText === null ? text : text.slice(0, evidenceStartIndex);
  const afterEvidenceText = evidenceText === null ? '' : text.slice(evidenceEndIndex + evidenceTerminator.length);

  return (
    <div className="market-commentary">
      {text.length > 0 ? (
        <p>
          {beforeEvidenceText}
          {evidenceText === null ? null : <span className="market-commentary__evidence">{evidenceText}</span>}
          {afterEvidenceText}
        </p>
      ) : null}
      {signals.length > 0 ? (
        <div className="market-commentary__signals" aria-label="외부 지표 신호">
          {signals.map((signal) => (
            <span key={signal.indicatorCode} title={signal.reasonText}>
              {mapIndicatorLabel(signal.indicatorCode)} {mapDirectionLabel(signal.direction)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function mapIndicatorLabel(value: FscDashboardCommentarySignal['indicatorCode']): string {
  switch (value) {
    case 'dubai':
      return '두바이유';
    case 'brent':
      return '브렌트유';
    case 'wti':
      return 'WTI';
    case 'usd-krw':
      return 'USD/KRW';
  }
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
