'use client';

import { useId, useState, type CSSProperties } from 'react';

import type { FscDashboardMarketTrendPoint } from '@/lib/dashboard/fsc-types';
import { formatDotDate } from '@/lib/dashboard/display-format';

type MarketTrendChartProps = {
  displayName: string;
  unitLabel: 'USD/BBL' | '원/USD';
  windowDays: number;
  direction: 'up' | 'down' | 'flat';
  points: readonly FscDashboardMarketTrendPoint[];
};

export type MarketTrendPlotPoint = {
  index: number;
  x: number;
  y: number;
  value: number;
  observedAt: string;
};

export type MarketTrendPlot = {
  points: MarketTrendPlotPoint[];
  min: number;
  max: number;
  minY: number;
  maxY: number;
  spanDays: number;
};

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 128;
const MARGIN = { top: 16, right: 58, bottom: 20, left: 44 };
const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMUM_PLOT_POINTS = 3;
// 주말·공휴일로 창 시작 부근 관측이 비어도 전체 창을 표시한 것으로 간주한다.
const WINDOW_EDGE_TOLERANCE_DAYS = 5;

export function buildMarketTrendPlot(
  points: readonly FscDashboardMarketTrendPoint[],
): MarketTrendPlot | null {
  const parsed = points
    .flatMap((point) => {
      const time = new Date(point.observedAt).getTime();
      return Number.isNaN(time) || !Number.isFinite(point.value) ? [] : [{ ...point, time }];
    })
    .sort((left, right) => left.time - right.time);

  if (parsed.length < MINIMUM_PLOT_POINTS) {
    return null;
  }

  const values = parsed.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = rawMax === rawMin ? Math.abs(rawMax) * 0.005 || 0.5 : (rawMax - rawMin) * 0.12;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const startTime = parsed[0].time;
  const timeSpan = parsed[parsed.length - 1].time - startTime || 1;

  const resolveY = (value: number) =>
    MARGIN.top + PLOT_HEIGHT - ((value - min) / (max - min)) * PLOT_HEIGHT;

  return {
    min: rawMin,
    max: rawMax,
    minY: resolveY(rawMin),
    maxY: resolveY(rawMax),
    spanDays: Math.round(timeSpan / DAY_MS) + 1,
    points: parsed.map((point, index) => ({
      index,
      x: MARGIN.left + ((point.time - startTime) / timeSpan) * PLOT_WIDTH,
      y: resolveY(point.value),
      value: point.value,
      observedAt: point.observedAt,
    })),
  };
}

function formatAxisValue(value: number): string {
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: value >= 100 ? 0 : 1,
  });
}

function formatTrendValue(value: number, unitLabel: MarketTrendChartProps['unitLabel']): string {
  const valueText = value.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return unitLabel === 'USD/BBL' ? `${valueText} USD/BBL` : `${valueText}원/USD`;
}

function formatAxisDate(observedAt: string): string {
  return formatDotDate(observedAt)?.slice(5) ?? '';
}

export function MarketTrendChart({
  displayName,
  unitLabel,
  windowDays,
  direction,
  points,
}: MarketTrendChartProps) {
  const tooltipId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const plot = buildMarketTrendPlot(points);

  if (plot === null) {
    return (
      <div className="market-trend-chart market-trend-chart--empty">
        <span className="market-trend-chart__caption">최근 {windowDays}일</span>
        <p role="status">추세 데이터 준비 중</p>
      </div>
    );
  }

  const firstPoint = plot.points[0];
  const latestPoint = plot.points[plot.points.length - 1];
  const activePoint = activeIndex === null ? null : plot.points[activeIndex] ?? null;
  const captionText =
    plot.spanDays >= windowDays - WINDOW_EDGE_TOLERANCE_DAYS
      ? `최근 ${windowDays}일`
      : `최근 데이터 ${plot.points.length}일`;
  const latestValueText = latestPoint.value.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const tooltipStyle: CSSProperties | undefined =
    activePoint === null
      ? undefined
      : {
          left: `${(activePoint.x / VIEW_WIDTH) * 100}%`,
          top: `${(activePoint.y / VIEW_HEIGHT) * 100}%`,
        };

  return (
    <div
      className="market-trend-chart"
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') {
          setActiveIndex(null);
        }
      }}
    >
      <span className="market-trend-chart__caption">{captionText}</span>
      <svg
        className={`market-trend-chart__svg market-trend-chart__svg--${direction}`}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`${displayName} ${captionText} 추이, ${formatDotDate(firstPoint.observedAt)} ${formatTrendValue(firstPoint.value, unitLabel)}부터 ${formatDotDate(latestPoint.observedAt)} ${formatTrendValue(latestPoint.value, unitLabel)}까지`}
      >
        <text
          className="market-trend-chart__axis-value"
          x={MARGIN.left - 8}
          y={plot.maxY + 4}
          textAnchor="end"
        >
          {formatAxisValue(plot.max)}
        </text>
        <text
          className="market-trend-chart__axis-value"
          x={MARGIN.left - 8}
          y={plot.minY + 4}
          textAnchor="end"
        >
          {formatAxisValue(plot.min)}
        </text>
        <text className="market-trend-chart__axis-date" x={MARGIN.left} y={VIEW_HEIGHT - 6}>
          {formatAxisDate(firstPoint.observedAt)}
        </text>
        <text
          className="market-trend-chart__axis-date"
          x={MARGIN.left + PLOT_WIDTH}
          y={VIEW_HEIGHT - 6}
          textAnchor="end"
        >
          {formatAxisDate(latestPoint.observedAt)}
        </text>
        <polyline
          className="market-trend-chart__line"
          points={plot.points.map((point) => `${point.x},${point.y}`).join(' ')}
        />
        <circle className="market-trend-chart__latest-dot" cx={latestPoint.x} cy={latestPoint.y} r={3.6} />
        <text
          className="market-trend-chart__latest-value"
          x={Math.min(latestPoint.x + 9, VIEW_WIDTH - 2)}
          y={Math.min(Math.max(latestPoint.y + 4, MARGIN.top + 4), VIEW_HEIGHT - MARGIN.bottom)}
        >
          {latestValueText}
        </text>
        {activePoint === null ? null : (
          <circle
            className="market-trend-chart__active-dot"
            cx={activePoint.x}
            cy={activePoint.y}
            r={3.6}
            aria-hidden="true"
          />
        )}
        {plot.points.map((point) => (
          <circle
            key={point.observedAt}
            className="market-trend-chart__hit"
            cx={point.x}
            cy={point.y}
            r={7}
            aria-hidden="true"
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                setActiveIndex(point.index);
              }
            }}
            onPointerDown={() =>
              setActiveIndex((current) => (current === point.index ? null : point.index))
            }
          />
        ))}
      </svg>
      {activePoint === null ? null : (
        <div id={tooltipId} className="market-trend-chart__tooltip" role="tooltip" style={tooltipStyle}>
          <strong>{formatDotDate(activePoint.observedAt)}</strong>
          <span>
            {displayName} {formatTrendValue(activePoint.value, unitLabel)}
          </span>
        </div>
      )}
    </div>
  );
}
