import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import type {
  OperationsStatus,
  OperationsStatusCenter,
  OperationsStatusItem,
} from '@/lib/forecast/operations-status';

const STATUS_VIEW: Record<OperationsStatus, { label: string; className: string }> = {
  healthy: { label: '정상', className: 'status-tag--ok' },
  watch: { label: '관찰', className: '' },
  attention: { label: '확인 필요', className: 'status-tag--warning' },
  'action-required': { label: '조치 필요', className: 'status-tag--warning' },
  unknown: { label: '판단 전', className: '' },
};

const VISIBLE_ITEM_LIMIT = 3;

function StatusItem({ item }: { item: OperationsStatusItem }) {
  return (
    <li className="operations-status__item">
      <strong>{item.title}</strong>
      <p className="admin-decision__note">{item.detail}</p>
    </li>
  );
}

function StageFlow({ stages }: { stages: OperationsStatusCenter['stages'] }) {
  if (stages.length === 0) {
    return null;
  }

  return (
    <ol className="operations-status__stages" aria-label="자동 튜닝 진행 흐름">
      {stages.map((stage) => (
        <li
          key={stage.key}
          className={`operations-status__stage${stage.current ? ' operations-status__stage--current' : ''}`}
        >
          {stage.label}
        </li>
      ))}
    </ol>
  );
}

export function AdminOperationsStatus({ center }: { center: OperationsStatusCenter }) {
  const view = STATUS_VIEW[center.status];
  const lead = center.primaryAction ?? center.observations[0] ?? null;
  const restItems = center.items.filter((item) => item.key !== lead?.key);
  const restObservations = center.observations.filter((item) => item.key !== lead?.key);
  const visibleItems = restItems.slice(0, VISIBLE_ITEM_LIMIT);
  const hiddenItems = [...restItems.slice(VISIBLE_ITEM_LIMIT), ...restObservations];

  return (
    <SectionCard
      title="Forecast 운영 상태"
      badge={<span className={`status-tag ${view.className}`.trim()}>{view.label}</span>}
      description="현재 Forecast 상태와 진행 중인 검증 단계를 한눈에 보여줍니다."
      className="admin-operations-status"
    >
      <div className="admin-detail-stack">
        {center.status === 'unknown' ? (
          <p className="admin-decision__note">예측 실행 기록이 없습니다.</p>
        ) : null}

        {center.status === 'healthy' ? (
          <p className="admin-decision__note">현재 즉시 확인할 항목이 없습니다.</p>
        ) : null}

        {lead === null ? null : (
          <div className="admin-panel operations-status__primary">
            {center.primaryAction === null ? null : (
              <span className="dashboard-shell__metric-label">가장 먼저 확인</span>
            )}
            <strong>{lead.title}</strong>
            <p className="admin-decision__note">{lead.detail}</p>
          </div>
        )}

        {visibleItems.length === 0 ? null : (
          <ol className="operations-status__list">
            {visibleItems.map((item) => (
              <StatusItem key={item.key} item={item} />
            ))}
          </ol>
        )}

        {hiddenItems.length === 0 ? null : (
          <details className="admin-panel admin-disclosure operations-status__more">
            <summary className="admin-disclosure__summary">
              <strong>전체 상태 보기</strong>
              <AdminDisclosureToggle />
            </summary>
            <div className="admin-disclosure__body">
              <ol className="operations-status__list">
                {hiddenItems.map((item) => (
                  <StatusItem key={item.key} item={item} />
                ))}
              </ol>
            </div>
          </details>
        )}

        <StageFlow stages={center.stages} />
      </div>
    </SectionCard>
  );
}
