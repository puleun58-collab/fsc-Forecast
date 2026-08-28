import type { FscDashboardResultSection, FscDashboardWeekItem } from './fsc-types';

const PRICE_SCALE = 3;
const RATIO_SCALE = 6;

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
  if (week.priceKrwPerL === null) {
    return {
      ...week,
      priceDiffKrwPerL: null,
      diffRatio: null,
    };
  }

  const priceKrwPerL = Number(week.priceKrwPerL);
  const priceDiffKrwPerL = round(priceKrwPerL - scenarioPriceKrwPerL, PRICE_SCALE);
  const diffRatio = round(priceDiffKrwPerL / scenarioPriceKrwPerL, RATIO_SCALE);

  return {
    ...week,
    priceDiffKrwPerL: formatPrice(priceDiffKrwPerL),
    diffRatio: formatRatio(diffRatio),
  };
}

export function buildFscPriceScenario(
  fsc: FscDashboardResultSection,
  scenarioPriceKrwPerL: number,
): FscDashboardResultSection {
  const weeks = fsc.weeks.map((week) => buildScenarioWeek(week, scenarioPriceKrwPerL));
  const quarterAverageKrwPerL = Number(fsc.quarterAverageKrwPerL);
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
