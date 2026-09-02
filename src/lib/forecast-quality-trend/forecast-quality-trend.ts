import type { ForecastQualityAssessment } from '@/lib/fsc/forecast-quality-signal';

export const FORECAST_QUALITY_CHART_LIMIT = 10;

export type ForecastQualityMetricKey =
  | 'recent13wMape'
  | 'recent4wMae'
  | 'recent26wMae'
  | 'directionAccuracy'
  | 'bias4w'
  | 'recent13wMae'
  | 'bias13w';

export type ForecastQualityDirection = 'improved' | 'worsened' | 'flat' | 'unknown';

/** 낮을수록 좋은 지표, 높을수록 좋은 지표, 0에 가까울수록 좋은 지표를 구분한다. */
type MetricPolarity = 'lower-better' | 'higher-better' | 'closer-to-zero';

type MetricDefinition = {
  key: ForecastQualityMetricKey;
  label: string;
  unit: 'percent' | 'percent-ratio' | 'krw-per-l';
  polarity: MetricPolarity;
  precision: number;
};

const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { key: 'recent13wMape', label: '최근 13주 MAPE', unit: 'percent', polarity: 'lower-better', precision: 2 },
  { key: 'recent4wMae', label: '최근 4주 MAE', unit: 'krw-per-l', polarity: 'lower-better', precision: 2 },
  { key: 'recent26wMae', label: '최근 26주 MAE', unit: 'krw-per-l', polarity: 'lower-better', precision: 2 },
  {
    key: 'directionAccuracy',
    label: '방향 정확도',
    unit: 'percent-ratio',
    polarity: 'higher-better',
    precision: 1,
  },
  { key: 'bias4w', label: '최근 Bias', unit: 'krw-per-l', polarity: 'closer-to-zero', precision: 2 },
];

const DETAIL_METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { key: 'recent13wMae', label: '최근 13주 MAE', unit: 'krw-per-l', polarity: 'lower-better', precision: 2 },
  { key: 'bias13w', label: '13주 Bias', unit: 'krw-per-l', polarity: 'closer-to-zero', precision: 2 },
];

export type ForecastQualityResult = {
  id: string;
  createdAt: string;
  recent13wWeeklyPriceMape: number | null;
  recent13wWeeklyPriceMae: number | null;
  recent4wWeeklyPriceMae: number | null;
  recent26wWeeklyPriceMae: number | null;
  recent13wDirectionAccuracy: number | null;
  forecastBias4w: number | null;
  forecastBias13w: number | null;
};

export type ForecastQualityMetric = {
  key: ForecastQualityMetricKey;
  label: string;
  unit: MetricDefinition['unit'];
  precision: number;
  current: number | null;
  previous: number | null;
  /** 표시 단위 기준 변화량. percent-ratio는 %p로 환산한다. */
  delta: number | null;
  direction: ForecastQualityDirection;
};

export type ForecastQualityChartPoint = {
  createdAt: string;
  mapePct: number;
};

export type ForecastQualityTrend = {
  status: ForecastQualityDirection;
  assessment: ForecastQualityAssessment | null;
  metrics: readonly ForecastQualityMetric[];
  detailMetrics: readonly ForecastQualityMetric[];
  chart: readonly ForecastQualityChartPoint[];
};

function readMetricValue(result: ForecastQualityResult | null, key: ForecastQualityMetricKey): number | null {
  if (result === null) {
    return null;
  }

  switch (key) {
    case 'recent13wMape':
      return result.recent13wWeeklyPriceMape;
    case 'recent13wMae':
      return result.recent13wWeeklyPriceMae;
    case 'recent4wMae':
      return result.recent4wWeeklyPriceMae;
    case 'recent26wMae':
      return result.recent26wWeeklyPriceMae;
    case 'directionAccuracy':
      return result.recent13wDirectionAccuracy;
    case 'bias4w':
      return result.forecastBias4w;
    case 'bias13w':
      return result.forecastBias13w;
  }
}

function toDisplayValue(value: number | null, unit: MetricDefinition['unit']): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return unit === 'percent-ratio' ? value * 100 : value;
}

function buildMetric(
  definition: MetricDefinition,
  current: ForecastQualityResult | null,
  previous: ForecastQualityResult | null,
): ForecastQualityMetric {
  const currentValue = toDisplayValue(readMetricValue(current, definition.key), definition.unit);
  const previousValue = toDisplayValue(readMetricValue(previous, definition.key), definition.unit);

  if (currentValue === null || previousValue === null) {
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      precision: definition.precision,
      current: currentValue,
      previous: previousValue,
      delta: null,
      direction: 'unknown',
    };
  }

  const factor = 10 ** definition.precision;
  const roundedCurrent = Math.round(currentValue * factor) / factor;
  const roundedPrevious = Math.round(previousValue * factor) / factor;
  const comparableCurrent =
    definition.polarity === 'closer-to-zero' ? Math.abs(roundedCurrent) : roundedCurrent;
  const comparablePrevious =
    definition.polarity === 'closer-to-zero' ? Math.abs(roundedPrevious) : roundedPrevious;
  const improvedWhenLower = definition.polarity !== 'higher-better';
  const direction: ForecastQualityDirection =
    comparableCurrent === comparablePrevious
      ? 'flat'
      : (comparableCurrent < comparablePrevious) === improvedWhenLower
        ? 'improved'
        : 'worsened';

  return {
    key: definition.key,
    label: definition.label,
    unit: definition.unit,
    precision: definition.precision,
    current: currentValue,
    previous: previousValue,
    delta: roundedCurrent - roundedPrevious,
    direction,
  };
}

/**
 * 최신순으로 전달된 동일 분기 FSC 결과에서 표시용 품질 추이를 만든다.
 * 저장된 지표를 읽어 비교만 하며 새 백테스트나 예측을 산출하지 않는다.
 */
export function buildForecastQualityTrend(
  results: readonly ForecastQualityResult[],
  assessment: ForecastQualityAssessment | null = null,
  chartLimit = FORECAST_QUALITY_CHART_LIMIT,
): ForecastQualityTrend {
  const current = results[0] ?? null;
  const previous = results[1] ?? null;
  const metrics = METRIC_DEFINITIONS.map((definition) => buildMetric(definition, current, previous));
  const detailMetrics = DETAIL_METRIC_DEFINITIONS.map((definition) =>
    buildMetric(definition, current, previous),
  );
  const chart = [...results]
    .reverse()
    .flatMap((result) =>
      result.recent13wWeeklyPriceMape === null || !Number.isFinite(result.recent13wWeeklyPriceMape)
        ? []
        : [{ createdAt: result.createdAt, mapePct: result.recent13wWeeklyPriceMape }],
    )
    .slice(-chartLimit);

  return {
    status: metrics[0]?.direction ?? 'unknown',
    assessment,
    metrics,
    detailMetrics,
    chart,
  };
}
