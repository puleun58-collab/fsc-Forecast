import { AdminActionButton } from './admin-action-button';
import {
  formatSignedPriceText,
  mapApprovalStatus,
  mapFreshnessStatus,
  mapReliabilityStatus,
} from './dashboard/dashboard-format';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';

export type AdminQuarterCardResult = {
  id: string;
  approvalStatus: string;
  dataFreshnessStatus: string;
  reliabilityGrade: string;
  reliabilitySampleCount: number;
  reliabilityMinimumSampleCount: number;
  recent13wWeeklyPriceMape: string | null;
  actualWeekCount: number;
  forecastWeekCount: number;
  quarterAverageKrwPerL: string;
  previousQuarterAverageKrwPerL: string | null;
};

type AdminQuarterCardProps = {
  quarterLabel: string;
  referenceQuarterLabel: string;
  periodLabel: string;
  result: AdminQuarterCardResult | null;
};

const MANUAL_ROLLOVER_CONFIRM_MESSAGE =
  '현재 운영 분기를 강제로 다음 분기로 전환합니다. 이 작업은 운영 상태에 영향을 줄 수 있습니다. 계속하시겠습니까?';

function formatQuarterAverageDiff(current: string, previous: string | null): string {
  if (previous === null) {
    return '직전 결과 없음';
  }

  return formatSignedPriceText(Number(current) - Number(previous), '원/L');
}

function buildMetrics(result: AdminQuarterCardResult): readonly (readonly [string, string])[] {
  const reliability = mapReliabilityStatus({
    grade: result.reliabilityGrade,
    sampleCount: result.reliabilitySampleCount,
    minimumSampleCount: result.reliabilityMinimumSampleCount,
    recent13wWeeklyPriceMape: result.recent13wWeeklyPriceMape,
  });

  return [
    ['승인 상태', mapApprovalStatus(result.approvalStatus).label],
    ['데이터 최신성', mapFreshnessStatus(result.dataFreshnessStatus).shortLabel],
    ['신뢰도', reliability.shortLabel],
    ['주차 구성', `Actual ${result.actualWeekCount}주 · Forecast ${result.forecastWeekCount}주`],
    ['분기 예상 평균', formatPriceText(result.quarterAverageKrwPerL)],
  ] as const;
}

export function AdminQuarterCard({
  quarterLabel,
  referenceQuarterLabel,
  periodLabel,
  result,
}: AdminQuarterCardProps) {
  return (
    <SectionCard
      title="현재 운영 분기"
      badge={quarterLabel}
      description="현재 활성 분기의 FSC 운영 상태와 주요 지표입니다."
      highlights={[`참조 분기 ${referenceQuarterLabel}`, `기간 ${periodLabel}`]}
      highlight
      className="admin-quarter"
    >
      <div className="admin-detail-stack">
        {result === null ? (
          <div className="section-card__placeholder">
            <span className="section-card__placeholder-title">아직 현재 운영 분기의 FSC 결과가 없습니다.</span>
            <span className="section-card__placeholder-copy">FSC 재계산을 실행하면 최신 기준 시나리오가 표시됩니다.</span>
          </div>
        ) : (
          <>
            <div className="admin-metric-grid">
              {buildMetrics(result).map(([label, value]) => (
                <div key={label} className="admin-metric">
                  <span className="dashboard-shell__metric-label">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="admin-panel">
              <strong>직전 결과 대비</strong>
              <span>
                분기 예상 평균{' '}
                {formatQuarterAverageDiff(result.quarterAverageKrwPerL, result.previousQuarterAverageKrwPerL)}
              </span>
            </div>
          </>
        )}

        <div className="admin-action">
          <AdminActionButton
            label="FSC 재계산"
            endpoint="/api/fsc/recompute"
            confirmMessage="새 immutable FSC 결과를 생성합니다. 계속할까요?"
          />
          {result === null ? null : (
            <AdminActionButton
              label="기준 시나리오 승인"
              endpoint="/api/fsc/approve"
              payload={{ resultId: result.id }}
              confirmMessage={`결과 ${result.id}를 승인합니다. 계속할까요?`}
            />
          )}
        </div>

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>고급 운영</strong>
            <span className="admin-disclosure__toggle" aria-hidden="true">
              <span className="admin-disclosure__toggle-closed">펼쳐보기 ▾</span>
              <span className="admin-disclosure__toggle-open">접기 ▴</span>
            </span>
          </summary>
          <div className="admin-disclosure__body">
            <p className="admin-decision__note">
              수동 분기 전환은 현재 운영 분기를 강제로 다음 분기로 이동합니다.
            </p>
            <AdminActionButton
              label="수동 분기 전환"
              endpoint="/api/fsc/quarter/rollover"
              payload={{ force: true }}
              variant="danger"
              confirmMessage={MANUAL_ROLLOVER_CONFIRM_MESSAGE}
            />
          </div>
        </details>
      </div>
    </SectionCard>
  );
}
