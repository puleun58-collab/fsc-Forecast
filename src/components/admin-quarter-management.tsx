import { AdminActionButton } from './admin-action-button';
import { SectionCard } from './section-card';

export type AdminQuarterSummary = {
  id: string;
  targetYear: number;
  targetQuarter: number;
  label: string;
  referenceLabel: string;
  status: 'draft' | 'active' | 'closed';
  isActive: boolean;
};

type AdminQuarterManagementProps = {
  quarters: readonly AdminQuarterSummary[];
};

const STATUS_VIEW: Record<AdminQuarterSummary['status'], { label: string; className: string }> = {
  active: { label: '운영 중', className: 'status-tag--ok' },
  draft: { label: '준비', className: 'status-tag--warning' },
  closed: { label: '완료', className: '' },
};

function QuarterRow({ quarter, activatable }: { quarter: AdminQuarterSummary; activatable: boolean }) {
  const statusView = STATUS_VIEW[quarter.status];

  return (
    <li className="quarter-management-row">
      <span className="quarter-management-row__quarter">
        <strong>{quarter.label}</strong>
        <span>참조 분기 {quarter.referenceLabel}</span>
      </span>
      <span className={`status-tag ${statusView.className}`.trim()}>{statusView.label}</span>
      {activatable ? (
        <AdminActionButton
          label="운영 분기로 전환"
          endpoint="/api/fsc/quarter/activate"
          payload={{ year: quarter.targetYear, quarter: quarter.targetQuarter }}
          confirmMessage={`${quarter.label}를 현재 운영 분기로 전환합니다. 계속할까요?`}
        />
      ) : null}
    </li>
  );
}

export function AdminQuarterManagement({ quarters }: AdminQuarterManagementProps) {
  const activeQuarter = quarters.find((quarter) => quarter.isActive) ?? null;
  const nextDraft = quarters.find((quarter) => quarter.status === 'draft') ?? null;
  const pastQuarters = quarters.filter(
    (quarter) => quarter.id !== activeQuarter?.id && quarter.id !== nextDraft?.id,
  );

  return (
    <SectionCard
      title="분기 관리"
      badge={nextDraft ? `다음 준비 분기 ${nextDraft.label}` : '준비 분기 없음'}
      description="현재 운영 분기와 다음 준비 분기를 관리합니다."
      className="admin-quarter-management"
    >
      <div className="admin-detail-stack">
        <ul className="quarter-management-list">
          {activeQuarter === null ? (
            <li className="quarter-management-row quarter-management-row--empty">
              현재 운영 중인 분기가 없습니다.
            </li>
          ) : (
            <QuarterRow quarter={activeQuarter} activatable={false} />
          )}
          {nextDraft === null ? (
            <li className="quarter-management-row quarter-management-row--empty">
              다음 준비 분기가 없습니다.
            </li>
          ) : (
            <QuarterRow quarter={nextDraft} activatable />
          )}
        </ul>

        {pastQuarters.length > 0 ? (
          <details className="admin-panel admin-disclosure">
            <summary className="admin-disclosure__summary">
              <strong>지난 분기</strong>
              <span className="admin-disclosure__toggle" aria-hidden="true">
                <span className="admin-disclosure__toggle-closed">상세 보기 ▾</span>
                <span className="admin-disclosure__toggle-open">상세 접기 ▴</span>
              </span>
            </summary>
            <div className="admin-disclosure__body">
              <ul className="quarter-management-list">
                {pastQuarters.map((quarter) => (
                  <QuarterRow key={quarter.id} quarter={quarter} activatable={quarter.status === 'draft'} />
                ))}
              </ul>
            </div>
          </details>
        ) : null}
      </div>
    </SectionCard>
  );
}
