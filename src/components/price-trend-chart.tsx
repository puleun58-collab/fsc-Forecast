import type { CSSProperties } from 'react';

import type { FscDashboardTrendPoint } from '@/lib/dashboard/fsc-types';

type PriceTrendChartProps = {
  points: readonly FscDashboardTrendPoint[];
  unavailableReason?: string;
};

const frameStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 16,
  border: '1px solid var(--border)',
  borderRadius: 16,
  background: 'var(--surface-muted)',
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: '0.92rem',
  lineHeight: 1.6,
};

const DISPLAY_DECIMALS = 2;

function formatPrice(value: number): string {
  return `${value.toFixed(DISPLAY_DECIMALS)}원`;
}

function buildPolyline(points: readonly FscDashboardTrendPoint[], width: number, height: number): string {
  if (points.length === 0) {
    return '';
  }

  const prices = points.map((point) => point.priceKrwPerL);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const xStep = points.length === 1 ? 0 : width / (points.length - 1);
  const yRange = maxPrice - minPrice || 1;

  return points
    .map((point, index) => {
      const x = index * xStep;
      const y = height - ((point.priceKrwPerL - minPrice) / yRange) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

export function PriceTrendChart({ points, unavailableReason }: PriceTrendChartProps) {
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
  const prices = points.map((point) => point.priceKrwPerL);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const latestPoint = points[points.length - 1];
  const firstPoint = points[0];

  return (
    <div style={frameStyle}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <p style={mutedTextStyle}>
          최근 {points.length}일 추이 · 시작 {firstPoint.date} · 최신 {latestPoint.date}
        </p>
        <p style={{ ...mutedTextStyle, fontWeight: 700, color: 'var(--text)' }}>
          범위 {formatPrice(minPrice)} ~ {formatPrice(maxPrice)}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label="최근 전국 평균 경유가 추이 차트">
        <line x1="0" y1={height} x2={width} y2={height} stroke="var(--border-strong)" strokeWidth="1" />
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={buildPolyline(points, width, height)}
        />
        <text x="0" y={height + 20} fill="var(--text-muted)" fontSize="12">
          {firstPoint.date}
        </text>
        <text x={width} y={height + 20} textAnchor="end" fill="var(--text-muted)" fontSize="12">
          {latestPoint.date}
        </text>
      </svg>
      <p style={mutedTextStyle}>최신 전국 평균 경유가 {formatPrice(latestPoint.priceKrwPerL)}/L</p>
    </div>
  );
}
