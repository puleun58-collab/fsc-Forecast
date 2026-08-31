'use client';

import { useState, type ReactNode } from 'react';

import { BaselinePriceControl } from './baseline-price-control';
import { DecisionSummary } from './decision-summary';
import { OilPriceHistory } from './oil-price-history';
import { WeeklyDetailTable } from './weekly-detail-table';
import { WeeklyForecastSection } from './weekly-forecast-section';

import type {
  FscDashboardCurrentPriceSection,
  FscDashboardQuarterSummary,
  FscDashboardResultSection,
  OilPriceHistorySection,
} from '@/lib/dashboard/fsc-types';
import { buildFscPriceScenario, parseScenarioPrice } from '@/lib/dashboard/price-scenario';

type PriceScenarioSectionsProps = {
  fsc: FscDashboardResultSection;
  oilPriceHistory: OilPriceHistorySection;
  currentPrice: FscDashboardCurrentPriceSection;
  statusRail: ReactNode;
  quarter: FscDashboardQuarterSummary;
  isActiveQuarterSelected: boolean;
};

export function PriceScenarioSections({
  fsc,
  oilPriceHistory,
  currentPrice,
  quarter,
  isActiveQuarterSelected,
  statusRail,
}: PriceScenarioSectionsProps) {
  const [priceInput, setPriceInput] = useState(fsc.basePriceKrwPerL);
  const scenarioPrice = parseScenarioPrice(priceInput);
  const scenarioFsc = scenarioPrice === null ? fsc : buildFscPriceScenario(fsc, scenarioPrice);
  const defaultPrice = Number(fsc.basePriceKrwPerL);
  const isModified = scenarioPrice !== null && Math.abs(scenarioPrice - defaultPrice) >= 0.005;
  const inputError = priceInput.trim() === ''
    ? '기준유가를 입력해 주세요.'
    : scenarioPrice === null
      ? '0보다 큰 기준유가를 입력해 주세요.'
      : null;

  return (
    <>
      <div className="dashboard-controls">
        {statusRail}
        <BaselinePriceControl
          priceInput={priceInput}
          inputError={inputError}
          isPriceModified={isModified}
          onPriceChange={setPriceInput}
          onPriceReset={() => setPriceInput(fsc.basePriceKrwPerL)}
        />
      </div>
      <DecisionSummary
        fsc={scenarioFsc}
        currentPrice={currentPrice}
        quarter={quarter}
        isActiveQuarterSelected={isActiveQuarterSelected}
      />
      <OilPriceHistory history={oilPriceHistory} />
      <WeeklyForecastSection fsc={scenarioFsc} historical={!isActiveQuarterSelected} />
      <WeeklyDetailTable
        weeks={scenarioFsc.weeks}
        previousWeekPriceKrwPerL={scenarioFsc.previousWeekPriceKrwPerL}
        useStoredWeekRange={!isActiveQuarterSelected}
      />
    </>
  );
}
