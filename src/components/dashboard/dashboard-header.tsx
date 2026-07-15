import {
  formatDisplayDate,
  formatDisplayDateTime,
  mapApprovalStatus,
  mapFreshnessStatus,
  mapReliabilityGrade,
} from './dashboard-format';

import type { FscDashboardQuarterSummary, FscDashboardResultSection } from '@/lib/dashboard/fsc-types';
import { formatQuarterLabel } from '@/lib/dashboard/display-format';

type DashboardHeaderProps = {
  quarter?: FscDashboardQuarterSummary;
  fsc?: FscDashboardResultSection;
};

export function DashboardHeader({ quarter, fsc }: DashboardHeaderProps) {
  const quarterLabel = quarter === undefined ? 'Active quarter 없음' : formatQuarterLabel(quarter.targetYear, quarter.targetQuarter);
  const basisDate = fsc === undefined ? '산출 결과 없음' : formatDisplayDate(fsc.createdAt.slice(0, 10));

  return (
    <header className="ops-header">
      <div className="ops-header__identity">
        <strong>FSC Forecast</strong>
        <span>Fuel surcharge decision support</span>
      </div>
      <div className="ops-header__controls" aria-label="대시보드 기준">
        <label className="ops-header__select-label">
          <span>Active quarter</span>
          <select className="ops-header__select" defaultValue={quarterLabel} disabled={quarter === undefined}>
            <option value={quarterLabel}>{quarterLabel}</option>
          </select>
        </label>
        <div className="ops-header__basis">
          <span>산출 기준일</span>
          <strong>{basisDate}</strong>
        </div>
        <a className="button button--secondary ops-header__refresh" href="/">
          데이터 갱신
        </a>
      </div>
    </header>
  );
}

export function StatusRail({ fsc }: { fsc?: FscDashboardResultSection }) {
  const freshness = fsc === undefined ? { label: '데이터 대기', tone: 'neutral' as const } : mapFreshnessStatus(fsc.dataFreshnessStatus);
  const approval = fsc === undefined ? { label: '승인 대기', tone: 'warning' as const } : mapApprovalStatus(fsc.approvalStatus);
  const reliability = fsc === undefined
    ? { label: '신뢰도 산정 전', detail: 'FSC 결과 생성 후 신뢰도 조건을 평가합니다.', tone: 'neutral' as const }
    : mapReliabilityGrade(fsc.reliabilityGrade);

  return (
    <div className="status-rail" aria-label="데이터 상태">
      <span className={`status-tag status-tag--${freshness.tone}`}>{freshness.label}</span>
      <span className={`status-tag status-tag--${approval.tone}`}>{approval.label}</span>
      <span className={`status-tag status-tag--${reliability.tone}`} title={reliability.detail}>
        {reliability.label}
      </span>
      {fsc !== undefined ? <span className="status-rail__timestamp">생성 {formatDisplayDateTime(fsc.createdAt)}</span> : null}
    </div>
  );
}
