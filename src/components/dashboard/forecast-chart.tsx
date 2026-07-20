'use client';

import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';

import {
  formatSignedPriceText,
  formatSignedRatioText,
  formatSequenceWeekLabel,
  formatWeekRange,
  getFirstForecastIndex,
  mapWeekKind,
  parseNumeric,
} from './dashboard-format';

import type { FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';
import { formatPriceText } from '@/lib/dashboard/display-format';

type ForecastChartProps = {
  weeks: readonly FscDashboardWeekItem[];
  basePriceKrwPerL: string;
};

type PlotPoint = {
  index: number;
  x: number;
  y: number;
  price: number;
  week: FscDashboardWeekItem;
};

type ActivePoint = {
  index: number;
  locked: boolean;
};

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 352;
const MARGIN = { top: 34, right: 28, bottom: 48, left: 104 };
const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;

function buildDomain(values: readonly number[]): { min: number; max: number } {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = Math.max(maxValue - minValue, 1);
  const padding = Math.max(spread * 0.18, 24);

  return {
    min: minValue - padding,
    max: maxValue + padding,
  };
}

function resolveY(value: number, min: number, max: number): number {
  const ratio = (value - min) / (max - min || 1);
  return MARGIN.top + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
}

function buildPlotPoints(weeks: readonly FscDashboardWeekItem[], min: number, max: number): PlotPoint[] {
  const xStep = weeks.length <= 1 ? 0 : PLOT_WIDTH / (weeks.length - 1);

  return weeks.flatMap((week, index) => {
    const price = parseNumeric(week.priceKrwPerL);
    if (price === null) {
      return [];
    }

    return [
      {
        index,
        x: MARGIN.left + xStep * index,
        y: resolveY(price, min, max),
        price,
        week,
      },
    ];
  });
}

function buildPolyline(points: readonly PlotPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function buildTicks(min: number, max: number): number[] {
  const middle = min + (max - min) / 2;
  return [max, middle, min];
}

function getTooltipStyle(point: PlotPoint): CSSProperties {
  return {
    left: `${(point.x / VIEW_WIDTH) * 100}%`,
    top: `${(point.y / VIEW_HEIGHT) * 100}%`,
  };
}

export function ForecastChart({ weeks, basePriceKrwPerL }: ForecastChartProps) {
  const tooltipId = useId();
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);
  const basePrice = parseNumeric(basePriceKrwPerL);
  const priceValues = weeks.map((week) => parseNumeric(week.priceKrwPerL)).filter((value): value is number => value !== null);

  if (priceValues.length === 0 || weeks.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>주간 가격 데이터가 없습니다.</strong>
        <span>관리자 재계산 후 실제/예측 경계와 차트가 표시됩니다.</span>
      </div>
    );
  }

  const domain = buildDomain(basePrice === null ? priceValues : [...priceValues, basePrice]);
  const points = buildPlotPoints(weeks, domain.min, domain.max);
  const firstForecastIndex = getFirstForecastIndex(weeks);
  const actualPoints = points.filter((point) => point.week.priceKind === 'actual');
  const forecastStartPointIndex = firstForecastIndex > 0 ? firstForecastIndex - 1 : firstForecastIndex;
  const forecastPoints = forecastStartPointIndex >= 0 ? points.slice(forecastStartPointIndex) : [];
  const referenceY = basePrice === null ? null : resolveY(basePrice, domain.min, domain.max);
  const monthBoundaries = points.filter(
    (point) => point.index === 0 || weeks[point.index - 1]?.targetMonth !== point.week.targetMonth,
  );
  const boundaryPoint = firstForecastIndex >= 0 ? points.find((point) => point.index === firstForecastIndex) ?? null : null;
  const previousBoundaryPoint =
    firstForecastIndex > 0 ? points.find((point) => point.index === firstForecastIndex - 1) ?? null : null;
  const boundaryX =
    boundaryPoint === null
      ? null
      : previousBoundaryPoint === null
        ? boundaryPoint.x
        : previousBoundaryPoint.x + (boundaryPoint.x - previousBoundaryPoint.x) / 2;
  const bandWidth =
    boundaryPoint === null || previousBoundaryPoint === null
      ? 18
      : Math.max(Math.abs(boundaryPoint.x - previousBoundaryPoint.x) * 0.45, 18);
  const activePlotPoint = activePoint === null ? null : points.find((point) => point.index === activePoint.index) ?? null;

  function activate(index: number, locked: boolean) {
    setActivePoint({ index, locked });
  }

  function clearTransientPoint() {
    setActivePoint((current) => (current?.locked ? current : null));
  }

  function togglePinnedPoint(index: number) {
    setActivePoint((current) => (current?.index === index && current.locked ? null : { index, locked: true }));
  }

  function handleMarkerKeyDown(event: KeyboardEvent<SVGCircleElement>, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePinnedPoint(index);
    }

    if (event.key === 'Escape') {
      setActivePoint(null);
    }
  }

  return (
    <div className="forecast-chart" onPointerLeave={clearTransientPoint}>
      <svg
        className="forecast-chart__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="주간 실제 및 예측 경유가 추이"
      >
        <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} rx="0" fill="transparent" aria-hidden="true" />
        {buildTicks(domain.min, domain.max).map((tick) => {
          const y = resolveY(tick, domain.min, domain.max);
          return (
            <g key={tick} className="forecast-chart__grid-line" aria-hidden="true">
              <line x1={MARGIN.left} x2={VIEW_WIDTH - MARGIN.right} y1={y} y2={y} />
              <text x={MARGIN.left - 12} y={y + 4} textAnchor="end">
                {formatPriceText(tick)}
              </text>
            </g>
          );
        })}
        {monthBoundaries.map((point) => (
          <g key={`month-${point.week.targetMonth}-${point.index}`} className="forecast-chart__month" aria-hidden="true">
            {point.index > 0 ? (
              <line x1={point.x} x2={point.x} y1={MARGIN.top} y2={VIEW_HEIGHT - MARGIN.bottom} />
            ) : null}
            <text x={point.x + 6} y={VIEW_HEIGHT - 14}>
              {point.week.targetMonth}월
            </text>
          </g>
        ))}
        {boundaryX !== null ? (
          <g aria-hidden="true">
            <rect
              className="forecast-chart__boundary-band"
              x={boundaryX - bandWidth / 2}
              y={MARGIN.top}
              width={bandWidth}
              height={PLOT_HEIGHT}
            />
            <text className="forecast-chart__boundary-label" x={boundaryX} y={MARGIN.top - 10} textAnchor="middle">
              예측 시작
            </text>
          </g>
        ) : null}
        {referenceY !== null ? (
          <g className="forecast-chart__reference" aria-hidden="true">
            <line x1={MARGIN.left} x2={VIEW_WIDTH - MARGIN.right} y1={referenceY} y2={referenceY} />
            <text x={VIEW_WIDTH - MARGIN.right} y={Math.max(MARGIN.top + 14, referenceY - 8)} textAnchor="end">
              기준유가 {formatPriceText(basePrice)}
            </text>
          </g>
        ) : null}
        {actualPoints.length > 1 ? <polyline className="forecast-chart__line forecast-chart__line--actual" points={buildPolyline(actualPoints)} /> : null}
        {forecastPoints.length > 1 ? (
          <polyline className="forecast-chart__line forecast-chart__line--forecast" points={buildPolyline(forecastPoints)} />
        ) : null}
        {points.map((point) => (
          <circle
            key={`point-${point.week.sequenceNo}`}
            className={`forecast-chart__marker forecast-chart__marker--${point.week.priceKind}`}
            cx={point.x}
            cy={point.y}
            r={point.week.priceKind === 'actual' ? 5 : 4.5}
            role="button"
            tabIndex={0}
            aria-describedby={activePlotPoint?.index === point.index ? tooltipId : undefined}
            aria-label={`${formatSequenceWeekLabel(point.week.sequenceNo)}, ${formatWeekRange(point.week, true)}, ${mapWeekKind(point.week.priceKind)}, ${formatPriceText(point.price)}`}
            onFocus={() => activate(point.index, false)}
            onBlur={clearTransientPoint}
            onPointerEnter={() => activate(point.index, false)}
            onClick={() => togglePinnedPoint(point.index)}
            onKeyDown={(event) => handleMarkerKeyDown(event, point.index)}
          />
        ))}
      </svg>
      {activePlotPoint !== null ? (
        <div id={tooltipId} className="forecast-chart__tooltip" role="tooltip" style={getTooltipStyle(activePlotPoint)}>
          <strong>
            {formatSequenceWeekLabel(activePlotPoint.week.sequenceNo)} · {formatWeekRange(activePlotPoint.week, true)}
          </strong>
          <span>{mapWeekKind(activePlotPoint.week.priceKind)} · {formatPriceText(activePlotPoint.price)}</span>
          <span>
            기준 대비 {formatSignedPriceText(activePlotPoint.week.priceDiffKrwPerL)} · {formatSignedRatioText(activePlotPoint.week.diffRatio)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
