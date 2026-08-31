import {
  formatDisplayDateTime,
  mapApprovalStatus,
  mapFreshnessStatus,
  mapReliabilityAdjustmentReason,
  mapReliabilityStatus,
  RELIABILITY_EVALUATION_NOTE,
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

export function StatusRail({
  fsc,
  historical = false,
}: {
  fsc?: FscDashboardResultSection;
  historical?: boolean;
}) {
  if (historical) {
    return (
      <div className="status-rail" aria-label="데이터 상태">
        <span className="status-tag status-tag--ok">확정 실적</span>
      </div>
    );
  }

  const freshness =
    fsc === undefined
      ? { label: '데이터 대기', tone: 'neutral' as const }
      : mapFreshnessStatus(fsc.dataFreshnessStatus);
  const approval =
    fsc === undefined
      ? { label: '승인 대기', tone: 'warning' as const }
      : mapApprovalStatus(fsc.approvalStatus);
  const reliability =
    fsc === undefined
      ? {
          label: '신뢰도 산정 전',
          detail: 'FSC 결과 생성 후 신뢰도 조건을 평가합니다.',
          tone: 'neutral' as const,
        }
      : mapReliabilityStatus({
          grade: fsc.reliabilityGrade,
          sampleCount: fsc.reliabilitySampleCount,
          minimumSampleCount: fsc.reliabilityMinimumSampleCount,
          recent13wWeeklyPriceMape: fsc.recent13wWeeklyPriceMape,
        });

  const mape = fsc?.recent13wWeeklyPriceMape ?? null;
  const isGradedReliability = reliability.tone !== 'neutral';

  return (
    <div className="status-rail" aria-label="데이터 상태">
      <span className={`status-tag status-tag--${freshness.tone}`}>{freshness.label}</span>
      <span className={`status-tag status-tag--${approval.tone}`}>{approval.label}</span>
      {fsc !== undefined && isGradedReliability ? (
        <details className="reliability-detail">
          <summary className={`status-tag status-tag--${reliability.tone} status-tag--interactive`}>
            {reliability.label}
            <span aria-hidden="true">ⓘ</span>
          </summary>
          <div className="reliability-detail__panel" role="group" aria-label="예측 신뢰도 상세">
            <p className="reliability-detail__grade">
              예측 신뢰도 <strong>{fsc.reliabilityGrade}</strong>
            </p>
            <p className="reliability-detail__row">
              최근 {fsc.reliabilityMinimumSampleCount}주 평균 오차(MAPE){' '}
              <strong>{mape === null ? '산정 중' : `${Number(mape).toFixed(2)}%`}</strong>
            </p>
            {fsc.reliabilityAdjustmentReasons.length > 0 ? (
              <>
                <p className="reliability-detail__row">신뢰도 참고 요인</p>
                <ul className="reliability-detail__reasons">
                  {fsc.reliabilityAdjustmentReasons.map((reason) => (
                    <li key={reason}>{mapReliabilityAdjustmentReason(reason)}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="reliability-detail__note">{RELIABILITY_EVALUATION_NOTE}</p>
          </div>
        </details>
      ) : (
        <span className={`status-tag status-tag--${reliability.tone}`} title={reliability.detail}>
          {reliability.label}
        </span>
      )}
    </div>
  );
}
