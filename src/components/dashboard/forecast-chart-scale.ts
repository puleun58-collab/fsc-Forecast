export type ForecastChartScale = {
  min: number;
  max: number;
  ticks: number[];
};

const TARGET_TICK_INTERVALS = 3;
const MIN_PADDING_KRW_PER_L = 24;
const PADDING_RATIO = 0.08;

function resolveNiceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;

  const niceFraction =
    fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 2.5
          ? 2.5
          : fraction <= 5
            ? 5
            : 10;

  return niceFraction * magnitude;
}

export function buildForecastChartScale(values: readonly number[]): ForecastChartScale {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Forecast chart scale requires at least one finite value.');
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = Math.max(maxValue - minValue, 1);
  const padding = Math.max(spread * PADDING_RATIO, MIN_PADDING_KRW_PER_L);
  const paddedMin = minValue - padding;
  const paddedMax = maxValue + padding;
  const step = resolveNiceStep((paddedMax - paddedMin) / TARGET_TICK_INTERVALS);
  const min = Math.floor(paddedMin / step) * step;
  const max = Math.ceil(paddedMax / step) * step;
  const ticks: number[] = [];

  for (let tick = max; tick >= min - step / 2; tick -= step) {
    ticks.push(Number(tick.toFixed(10)));
  }

  return { min, max, ticks };
}
