import type { CSSProperties } from 'react';

import {
  calculateRecentAverage,
  formatCompactDateRange,
  formatDotDate,
  formatPriceText,
} from '@/lib/dashboard/display-format';

import type { FscDashboardTrendPoint } from '@/lib/dashboard/fsc-types';

type PriceTrendChartProps = {
  points: readonly FscDashboardTrendPoint[];
  latestMonthlyAverageKrwPerL: number | null;
  referenceQuarterAverageKrwPerL: number | null;
  referenceQuarterLabel: string;
  unavailableReason?: string;
};

type ChartPoint = {
  x: number;
  y: number;
  point: FscDashboardTrendPoint;
};

const frameStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  padding: 16,
  border: '1px solid var(--border)',
  borderRadius: 16,
  background: 'var(--surface-strong)',
};

function buildChartPoints(
  points: readonly FscDashboardTrendPoint[],
  width: number,
  height: number,
  minPrice: number,
  maxPrice: number,
): ChartPoint[] {
  const xStep = points.length === 1 ? 0 : width / (points.length - 1);
  const yRange = maxPrice - minPrice || 1;

  return points.map((point, index) => ({
    x: index * xStep,
    y: height - ((point.priceKrwPerL - minPrice) / yRange) * height,
    point,
  }));
}

function buildPolyline(points: readonly ChartPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function resolveLineY(value: number, height: number, minPrice: number, maxPrice: number): number {
  const yRange = maxPrice - minPrice || 1;
  return height - ((value - minPrice) / yRange) * height;
}

export function PriceTrendChart({
  points,
  latestMonthlyAverageKrwPerL,
  referenceQuarterAverageKrwPerL,
  referenceQuarterLabel,
  unavailableReason,
}: PriceTrendChartProps) {
  if (points.length < 2) {
    return (
      <div className="section-card__placeholder" aria-label="전국 평균 추이 비가용 상태">
        <span className="section-card__placeholder-title">추이 데이터 사용 불가</span>
        <span className="section-card__placeholder-copy">
          {unavailableReason ?? '최근 추이를 그릴 수 있는 데이터가 아직 충분하지 않습니다.'}
        </span>
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const firstPoint = points[0];
  const latestPoint = points[points.length - 1];
  const recent7DayAverageKrwPerL = calculateRecentAverage(points, 7);
  const comparableValues = [
    ...points.map((point) => point.priceKrwPerL),
    ...(referenceQuarterAverageKrwPerL === null ? [] : [referenceQuarterAverageKrwPerL]),
  ];
  const minPrice = Math.min(...comparableValues);
  const maxPrice = Math.max(...comparableValues);
  const chartPoints = buildChartPoints(points, width, height, minPrice, maxPrice);
  const latestChartPoint = chartPoints[chartPoints.length - 1];
  const referenceLineY =
    referenceQuarterAverageKrwPerL === null
      ? null
      : resolveLineY(referenceQuarterAverageKrwPerL, height, minPrice, maxPrice);
  const periodText = `최근 ${points.length}일 · ${formatCompactDateRange(firstPoint.date, latestPoint.date)}`;
  const screenReaderSummary = [
    `${periodText}의 일별 가격 추이입니다.`,
    `현재 가격 ${formatPriceText(latestPoint.priceKrwPerL)}.`,
    `최근 7일 평균 ${formatPriceText(recent7DayAverageKrwPerL)}.`,
    `이번 달 평균 ${formatPriceText(latestMonthlyAverageKrwPerL)}.`,
    referenceQuarterAverageKrwPerL === null
      ? null
      : `${referenceQuarterLabel} 평균 판매가격 기준선 ${formatPriceText(referenceQuarterAverageKrwPerL)}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div style={frameStyle}>
      <p className="dashboard-shell__trend-period">{periodText}</p>
      <div className="dashboard-shell__trend-summary-grid" aria-label="추이 요약 지표">
        <div className="dashboard-shell__trend-summary-card">
          <span className="dashboard-shell__metric-label">현재 가격</span>
          <strong className="dashboard-shell__trend-summary-value">{formatPriceText(latestPoint.priceKrwPerL)}</strong>
        </div>
        <div className="dashboard-shell__trend-summary-card">
          <span className="dashboard-shell__metric-label">최근 7일 평균</span>
          <strong className="dashboard-shell__trend-summary-value">{formatPriceText(recent7DayAverageKrwPerL)}</strong>
        </div>
        <div className="dashboard-shell__trend-summary-card">
          <span className="dashboard-shell__metric-label">이번 달 평균</span>
          <strong className="dashboard-shell__trend-summary-value">{formatPriceText(latestMonthlyAverageKrwPerL)}</strong>
        </div>
      </div>
      <p className="dashboard-shell__sr-only">{screenReaderSummary}</p>
      <svg viewBox={`0 0 ${width} ${height + 32}`} role="img" aria-label="전국 평균 경유가 일별 가격 추이 차트">
        <line x1="0" y1={height} x2={width} y2={height} stroke="var(--chart-grid)" strokeWidth="1" aria-hidden="true" />
        {referenceLineY !== null ? (
          <>
            <line
              x1="0"
              y1={referenceLineY}
              x2={width}
              y2={referenceLineY}
              stroke="var(--chart-benchmark)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              aria-hidden="true"
            />
            <text
              x={width - 4}
              y={Math.max(14, referenceLineY - 8)}
              textAnchor="end"
              fill="var(--chart-benchmark)"
              fontSize="12"
              fontWeight="700"
            >
              {`${referenceQuarterLabel} 평균 ${formatPriceText(referenceQuarterAverageKrwPerL)}`}

            </text>
          </>
        ) : null}
        <polyline
          fill="none"
          stroke="var(--brand)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={buildPolyline(chartPoints)}
          aria-hidden="true"
        />
        <circle cx={latestChartPoint.x} cy={latestChartPoint.y} r="5" fill="var(--brand)" aria-hidden="true" />
        <text
          x={Math.max(8, latestChartPoint.x - 8)}
          y={Math.max(14, latestChartPoint.y - 12)}
          textAnchor="end"
          fill="var(--brand-text)"
          fontSize="12"
          fontWeight="700"
        >
          {formatPriceText(latestPoint.priceKrwPerL)}
        </text>
        <text x="0" y={height + 24} fill="var(--text-secondary)" fontSize="12">
          {formatDotDate(firstPoint.date)}
        </text>
        <text x={width} y={height + 24} textAnchor="end" fill="var(--text-secondary)" fontSize="12">
          {formatDotDate(latestPoint.date)}
        </text>
      </svg>
      <div className="dashboard-shell__trend-footer">
        <span className="dashboard-shell__metric-caption">일별 가격 · 오피넷</span>
        {referenceQuarterAverageKrwPerL !== null ? (
          <span className="dashboard-shell__metric-caption">기준선은 {referenceQuarterLabel} 평균 판매가격입니다.</span>
        ) : null}
      </div>
    </div>
  );
}
