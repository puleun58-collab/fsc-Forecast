import type { FscDashboardResultSection, FscDashboardWeekItem } from './fsc-types';

const PRICE_SCALE = 3;
const RATIO_SCALE = 6;
const FALLBACK_SOURCE_KINDS = new Set<FscDashboardWeekItem['forecastSourceKind']>([
  'applied_price_fallback',
  'base_price_fallback',
]);

function round(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
}

function formatPrice(value: number): string {
  return round(value, PRICE_SCALE).toFixed(2);
}

function formatRatio(value: number): string {
  return round(value, RATIO_SCALE).toFixed(RATIO_SCALE);
}

export function parseScenarioPrice(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function calculateScenarioFscValues(input: {
  scenarioPriceKrwPerL: number;
  quarterAverageKrwPerL: number;
  fscLowRate: number;
  fscHighRate: number;
}) {
  const priceDiffKrwPerL = round(
    input.quarterAverageKrwPerL - input.scenarioPriceKrwPerL,
    PRICE_SCALE,
  );
  const diffRatio = round(priceDiffKrwPerL / input.scenarioPriceKrwPerL, RATIO_SCALE);

  return {
    priceDiffKrwPerL,
    diffRatio,
    fscLowKrwPerL: round(
      input.quarterAverageKrwPerL * (1 + diffRatio * input.fscLowRate),
      PRICE_SCALE,
    ),
    fscHighKrwPerL: round(
      input.quarterAverageKrwPerL * (1 + diffRatio * input.fscHighRate),
      PRICE_SCALE,
    ),
  };
}

function buildScenarioWeek(
  week: FscDashboardWeekItem,
  scenarioPriceKrwPerL: number,
): FscDashboardWeekItem {
  const originalWeekPrice = Number(week.priceKrwPerL);
  const usesScenarioFallback = FALLBACK_SOURCE_KINDS.has(week.forecastSourceKind);
  const priceKrwPerL = usesScenarioFallback ? scenarioPriceKrwPerL : originalWeekPrice;
  const priceDiffKrwPerL = round(priceKrwPerL - scenarioPriceKrwPerL, PRICE_SCALE);
  const diffRatio = round(priceDiffKrwPerL / scenarioPriceKrwPerL, RATIO_SCALE);

  return {
    ...week,
    priceKrwPerL: formatPrice(priceKrwPerL),
    forecastPriceKrwPerL:
      usesScenarioFallback && week.priceKind === 'forecast'
        ? formatPrice(priceKrwPerL)
        : week.forecastPriceKrwPerL,
    priceDiffKrwPerL: formatPrice(priceDiffKrwPerL),
    diffRatio: formatRatio(diffRatio),
  };
}

export function buildFscPriceScenario(
  fsc: FscDashboardResultSection,
  scenarioPriceKrwPerL: number,
): FscDashboardResultSection {
  const weeks = fsc.weeks.map((week) => buildScenarioWeek(week, scenarioPriceKrwPerL));
  const fallbackDelta = fsc.weeks.reduce((total, week, index) => {
    if (!FALLBACK_SOURCE_KINDS.has(week.forecastSourceKind)) {
      return total;
    }

    return total + Number(weeks[index]?.priceKrwPerL ?? week.priceKrwPerL) - Number(week.priceKrwPerL);
  }, 0);
  const originalQuarterAverage = Number(fsc.quarterAverageKrwPerL);
  const quarterAverageKrwPerL = round(
    originalQuarterAverage + (weeks.length === 0 ? 0 : fallbackDelta / weeks.length),
    PRICE_SCALE,
  );
  const calculation = calculateScenarioFscValues({
    scenarioPriceKrwPerL,
    quarterAverageKrwPerL,
    fscLowRate: Number(fsc.fscLowRate),
    fscHighRate: Number(fsc.fscHighRate),
  });
  const formattedScenarioPrice = formatPrice(scenarioPriceKrwPerL);

  return {
    ...fsc,
    basePriceKrwPerL: formattedScenarioPrice,
    appliedPriceKrwPerL: formattedScenarioPrice,
    quarterAverageKrwPerL: formatPrice(quarterAverageKrwPerL),
    priceDiffKrwPerL: formatPrice(calculation.priceDiffKrwPerL),
    diffRatio: formatRatio(calculation.diffRatio),
    fscLowKrwPerL: formatPrice(calculation.fscLowKrwPerL),
    fscHighKrwPerL: formatPrice(calculation.fscHighKrwPerL),
    weeks,
  };
}
