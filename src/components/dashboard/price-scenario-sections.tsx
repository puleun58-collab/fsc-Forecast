'use client';

import { useState } from 'react';

import { DecisionSummary } from './decision-summary';
import { OilPriceHistory } from './oil-price-history';
import { WeeklyDetailTable } from './weekly-detail-table';
import { WeeklyForecastSection } from './weekly-forecast-section';

import type {
  FscDashboardCurrentPriceSection,
  FscDashboardResultSection,
  OilPriceHistorySection,
} from '@/lib/dashboard/fsc-types';
import { buildFscPriceScenario, parseScenarioPrice } from '@/lib/dashboard/price-scenario';

type PriceScenarioSectionsProps = {
  fsc: FscDashboardResultSection;
  oilPriceHistory: OilPriceHistorySection;
  currentPrice: FscDashboardCurrentPriceSection;
};

export function PriceScenarioSections({ fsc, oilPriceHistory, currentPrice }: PriceScenarioSectionsProps) {
  const [priceInput, setPriceInput] = useState(fsc.basePriceKrwPerL);
  const scenarioPrice = parseScenarioPrice(priceInput);
  const scenarioFsc = scenarioPrice === null ? fsc : buildFscPriceScenario(fsc, scenarioPrice);
  const defaultPrice = Number(fsc.basePriceKrwPerL);
  const isModified = scenarioPrice !== null && Math.abs(scenarioPrice - defaultPrice) >= 0.005;
  const inputError = priceInput.trim() === ''
    ? '가격을 입력해 주세요.'
    : scenarioPrice === null
      ? '0보다 큰 숫자를 입력해 주세요.'
      : null;

  return (
    <>
      <DecisionSummary
        fsc={scenarioFsc}
        currentPrice={currentPrice}
        priceInput={priceInput}
        inputError={inputError}
        isPriceModified={isModified}
        onPriceChange={setPriceInput}
        onPriceReset={() => setPriceInput(fsc.basePriceKrwPerL)}
      />
      <OilPriceHistory history={oilPriceHistory} />
      <WeeklyForecastSection fsc={scenarioFsc} />
      <WeeklyDetailTable
        weeks={scenarioFsc.weeks}
        previousWeekPriceKrwPerL={scenarioFsc.previousWeekPriceKrwPerL}
      />
    </>
  );
}
