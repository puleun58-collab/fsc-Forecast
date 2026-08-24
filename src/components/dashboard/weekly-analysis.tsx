'use client';

import { useState } from 'react';

import { WeeklyDetailTable } from './weekly-detail-table';
import { WeeklyForecastSection } from './weekly-forecast-section';
import { WeeklyOutlookTable } from './weekly-outlook-table';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

export type WeeklyAnalysisView = 'quarter' | 'outlook';

export function WeeklyAnalysis({ fsc }: { readonly fsc: FscDashboardResultSection }) {
  const [view, setView] = useState<WeeklyAnalysisView>('quarter');

  return (
    <>
      <WeeklyForecastSection fsc={fsc} view={view} onViewChange={setView} />
      {view === 'quarter' ? (
        <WeeklyDetailTable
          weeks={fsc.weeks}
          previousWeekPriceKrwPerL={fsc.previousWeekPriceKrwPerL}
        />
      ) : (
        <WeeklyOutlookTable outlook={fsc.weeklyOutlook} />
      )}
    </>
  );
}
