import { DashboardHeader, StatusRail } from './dashboard-header';
import { DecisionSummary } from './decision-summary';
import { MarketReferencePanel } from './market-reference-panel';
import { MethodologyDisclosure } from './methodology-disclosure';
import { WeeklyDetailTable } from './weekly-detail-table';
import { WeeklyForecastSection } from './weekly-forecast-section';

import type { FscDashboardData } from '@/lib/dashboard/fsc-types';
import { formatQuarterLabel } from '@/lib/dashboard/display-format';

type FscDashboardProps = {
  data: FscDashboardData;
};

export function FscDashboard({ data }: FscDashboardProps) {
  if (data.state === 'unavailable') {
    return (
      <main id="main-content" className="fsc-dashboard fsc-dashboard--state">
        <DashboardHeader />
        <section className="surface-panel dashboard-state" role="status" aria-labelledby="dashboard-unavailable-title">
          <h1 id="dashboard-unavailable-title">{data.reason}</h1>
          <p>{data.detail}</p>
        </section>
      </main>
    );
  }

  const quarterLabel = formatQuarterLabel(data.quarter.targetYear, data.quarter.targetQuarter);

  if (data.state === 'empty') {
    return (
      <main id="main-content" className="fsc-dashboard">
        <DashboardHeader quarter={data.quarter} />
        <StatusRail />
        <section className="surface-panel dashboard-state" role="status" aria-labelledby="dashboard-empty-title">
          <h1 id="dashboard-empty-title">아직 FSC 산출 결과가 없습니다.</h1>
          <p>관리자 재계산 후 분기 평균 예상 유가, FSC 파생 결과, actual/forecast 경계가 표시됩니다.</p>
          <span className="metric-caption">대상 분기 {quarterLabel}</span>
        </section>
        <MarketReferencePanel support={data.support} />
      </main>
    );
  }

  return (
    <main id="main-content" className="fsc-dashboard">
      <DashboardHeader quarter={data.quarter} fsc={data.fsc} />
      <StatusRail fsc={data.fsc} />
      <DecisionSummary fsc={data.fsc} />
      <WeeklyForecastSection fsc={data.fsc} />
      <WeeklyDetailTable weeks={data.fsc.weeks} />
      <MarketReferencePanel support={data.support} />
      <MethodologyDisclosure fsc={data.fsc} />
    </main>
  );
}
