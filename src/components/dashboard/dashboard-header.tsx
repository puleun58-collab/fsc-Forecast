import {
  formatDisplayDateTime,
  mapApprovalStatus,
  mapFreshnessStatus,
  mapReliabilityStatus,
} from './dashboard-format';
import { QuarterSelect } from './quarter-select';

import type { FscDashboardQuarterSummary, FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

type DashboardHeaderProps = {
  quarter?: FscDashboardQuarterSummary;
  availableQuarters?: readonly FscDashboardQuarterSummary[];
  fsc?: FscDashboardResultSection;
};

export function DashboardHeader({ quarter, availableQuarters, fsc }: DashboardHeaderProps) {
  const basisDateTime = fsc === undefined ? '산출 결과 없음' : formatDisplayDateTime(fsc.dataBasisAt, '기록 없음');

  return (
    <header className="ops-header">
      <div className="ops-header__identity">
        <strong>FSC Forecast</strong>
        <span>Fuel surcharge decision support</span>
      </div>
      <div className="ops-header__controls" aria-label="대시보드 기준">
        <QuarterSelect quarter={quarter} availableQuarters={availableQuarters} />
        <div className="ops-header__basis">
          <span>데이터 기준 시각</span>
          <strong>{basisDateTime}</strong>
        </div>
      </div>
    </header>
  );
}

export function StatusRail({ fsc }: { fsc?: FscDashboardResultSection }) {
  const freshness = fsc === undefined ? { label: '데이터 대기', tone: 'neutral' as const } : mapFreshnessStatus(fsc.dataFreshnessStatus);
  const approval = fsc === undefined ? { label: '승인 대기', tone: 'warning' as const } : mapApprovalStatus(fsc.approvalStatus);
  const reliability = fsc === undefined
    ? { label: '신뢰도 산정 전', detail: 'FSC 결과 생성 후 신뢰도 조건을 평가합니다.', tone: 'neutral' as const }
    : mapReliabilityStatus({
        grade: fsc.reliabilityGrade,
        sampleCount: fsc.reliabilitySampleCount,
        minimumSampleCount: fsc.reliabilityMinimumSampleCount,
        recent13wWeeklyPriceMape: fsc.recent13wWeeklyPriceMape,
      });

  return (
    <div className="status-rail" aria-label="데이터 상태">
      <span className={`status-tag status-tag--${freshness.tone}`}>{freshness.label}</span>
      <span className={`status-tag status-tag--${approval.tone}`}>{approval.label}</span>
      <span className={`status-tag status-tag--${reliability.tone}`} title={reliability.detail}>
        {reliability.label}
      </span>
    </div>
  );
}
