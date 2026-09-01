import { SectionCard } from './section-card';

import type {
  AdminOperationEvent,
  AdminOperationStatus,
} from '@/lib/admin-operation-history/admin-operation-history';
import { formatDashboardDateTime } from '@/lib/dashboard/dashboard-time';

const STATUS_VIEW: Record<AdminOperationStatus, { label: string; className: string }> = {
  success: { label: '성공', className: 'status-tag--ok' },
  failed: { label: '실패', className: 'status-tag--critical' },
  running: { label: '진행 중', className: 'status-tag--warning' },
  pending: { label: '대기', className: '' },
};

function OperationRowContent({ event }: { event: AdminOperationEvent }) {
  const statusView = STATUS_VIEW[event.status];

  return (
    <>
      <span className="operation-history-row__time">{formatDashboardDateTime(event.occurredAt)}</span>
      <strong className="operation-history-row__label">{event.label}</strong>
      <span className={`status-tag ${statusView.className}`.trim()}>{statusView.label}</span>
      <span className="operation-history-row__summary">{event.summary}</span>
    </>
  );
}

export function AdminOperationHistory({ events }: { events: readonly AdminOperationEvent[] }) {
  if (events.length === 0) {
    return (
      <SectionCard
        title="최근 운영 이력"
        badge="이력 없음"
        description="최근 데이터 수집 및 Forecast/FSC 실행 흐름입니다."
        className="admin-operation-history"
        emptyStateTitle="아직 운영 이력이 없습니다."
        emptyStateCopy="데이터 수집 또는 Forecast/FSC 실행 후 이력이 표시됩니다."
      />
    );
  }

  return (
    <SectionCard
      title="최근 운영 이력"
      badge={`최근 ${events.length}건`}
      description="최근 데이터 수집 및 Forecast/FSC 실행 흐름입니다."
      className="admin-operation-history"
    >
      <ul className="operation-history-list">
        {events.map((event) => {
          const hasDetails = event.details.length > 0 || event.errorMessage !== null;

          if (!hasDetails) {
            return (
              <li key={event.id} className={`operation-history-item operation-history-item--${event.status}`}>
                <div className="operation-history-row">
                  <OperationRowContent event={event} />
                </div>
              </li>
            );
          }

          return (
            <li key={event.id} className={`operation-history-item operation-history-item--${event.status}`}>
              <details className="operation-history-entry">
                <summary className="operation-history-row">
                  <OperationRowContent event={event} />
                  <span className="operation-history-row__toggle admin-disclosure__toggle" aria-hidden="true">
                    <span className="admin-disclosure__toggle-closed">상세 보기 ▾</span>
                    <span className="admin-disclosure__toggle-open">상세 접기 ▴</span>
                  </span>
                </summary>
                <div className="operation-history-detail">
                  {event.details.length > 0 ? (
                    <dl className="operation-history-detail__list">
                      {event.details.map((detail) => (
                        <div key={detail.label}>
                          <dt>{detail.label}</dt>
                          <dd>{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {event.errorMessage ? (
                    <p className="operation-history-detail__error">
                      <span>오류 사유</span>
                      <strong>{event.errorMessage}</strong>
                    </p>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
