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

import type {
  FscDashboardOutlookWeekItem,
  FscDashboardWeekItem,
} from '@/lib/dashboard/fsc-types';
import { formatPriceText } from '@/lib/dashboard/display-format';
import { buildForecastChartScale } from './forecast-chart-scale';

type ForecastChartProps = {
  weeks: readonly FscDashboardWeekItem[];
  basePriceKrwPerL: string;
  view?: 'quarter' | 'outlook';
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
const MARGIN = { top: 34, right: 28, bottom: 48, left: 64 };
const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;

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

function getTooltipStyle(point: PlotPoint): CSSProperties {
  return {
    left: `${(point.x / VIEW_WIDTH) * 100}%`,
    top: `${(point.y / VIEW_HEIGHT) * 100}%`,
  };
}

function isOutlookWeek(week: FscDashboardWeekItem): week is FscDashboardOutlookWeekItem {
  return 'horizonIndex' in week;
}

function getPointTitle(week: FscDashboardWeekItem, view: 'quarter' | 'outlook'): string {
  if (view === 'outlook' && isOutlookWeek(week) && week.horizonIndex !== null) {
    return `Forecast ${week.horizonIndex}주`;
  }

  if (view === 'outlook') {
    return `Actual · ${formatWeekRange(week, true)}`;
  }

  return `${formatSequenceWeekLabel(week.sequenceNo)} · ${formatWeekRange(week, true)}`;
}

export function ForecastChart({ weeks, basePriceKrwPerL, view = 'quarter' }: ForecastChartProps) {
  const tooltipId = useId();
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);
  const basePrice = parseNumeric(basePriceKrwPerL);
  const priceValues = weeks.flatMap((week) => {
    const values = [parseNumeric(week.priceKrwPerL)];

    if (isOutlookWeek(week)) {
      values.push(parseNumeric(week.lowerBoundKrwPerL), parseNumeric(week.upperBoundKrwPerL));
    }

    return values.filter((value): value is number => value !== null);
  });

  if (priceValues.length === 0 || weeks.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>주간 가격 데이터가 없습니다.</strong>
        <span>관리자 재계산 후 actual/forecast 경계와 차트가 표시됩니다.</span>
      </div>
    );
  }

  const domain = buildForecastChartScale(basePrice === null ? priceValues : [...priceValues, basePrice]);
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
  const confidencePoints = points.flatMap((point) => {
    if (!isOutlookWeek(point.week) || point.week.priceKind !== 'forecast') {
      return [];
    }

    const lower = parseNumeric(point.week.lowerBoundKrwPerL);
    const upper = parseNumeric(point.week.upperBoundKrwPerL);

    return lower === null || upper === null
      ? []
      : [{ x: point.x, lowerY: resolveY(lower, domain.min, domain.max), upperY: resolveY(upper, domain.min, domain.max) }];
  });
  const confidencePolygon = [
    ...confidencePoints.map((point) => `${point.x},${point.upperY}`),
    ...[...confidencePoints].reverse().map((point) => `${point.x},${point.lowerY}`),
  ].join(' ');

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
        role="group"
        aria-label={view === 'outlook' ? '최신 actual 1주 및 향후 forecast 13주 유가 전망' : '주간 actual 및 forecast 유가 추이'}
      >
        <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} rx="0" fill="transparent" aria-hidden="true" />
        <text
          className="forecast-chart__axis-unit"
          x={MARGIN.left - 12}
          y={MARGIN.top - 14}
          textAnchor="end"
          aria-hidden="true"
        >
          원/L
        </text>
        {domain.ticks.map((tick) => {
          const y = resolveY(tick, domain.min, domain.max);
          return (
            <g key={tick} className="forecast-chart__grid-line" aria-hidden="true">
              <line x1={MARGIN.left} x2={VIEW_WIDTH - MARGIN.right} y1={y} y2={y} />
              <text x={MARGIN.left - 12} y={y + 4} textAnchor="end">
                {tick.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
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
        {confidencePoints.length > 1 ? (
          <polygon className="forecast-chart__confidence-band" points={confidencePolygon} aria-hidden="true" />
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
            aria-label={`${getPointTitle(point.week, view)}, ${mapWeekKind(point.week.priceKind)}, ${formatPriceText(point.price)}`}
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
            {getPointTitle(activePlotPoint.week, view)}
          </strong>
          <span>{mapWeekKind(activePlotPoint.week.priceKind)} · {formatPriceText(activePlotPoint.price)}</span>
          {isOutlookWeek(activePlotPoint.week) && activePlotPoint.week.lowerBoundKrwPerL !== null && activePlotPoint.week.upperBoundKrwPerL !== null ? (
            <span>
              예측 범위 {formatPriceText(activePlotPoint.week.lowerBoundKrwPerL)}–{formatPriceText(activePlotPoint.week.upperBoundKrwPerL)}
            </span>
          ) : null}
          <span>
            기준 대비 {formatSignedPriceText(activePlotPoint.week.priceDiffKrwPerL)} · {formatSignedRatioText(activePlotPoint.week.diffRatio)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
