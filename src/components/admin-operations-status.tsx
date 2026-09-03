import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import type {
  OperationsStatus,
  OperationsStatusCenter,
  OperationsStatusItem,
} from '@/lib/forecast/operations-status';

const STATUS_VIEW: Record<OperationsStatus, { label: string; className: string; summary: string }> = {
  healthy: {
    label: '정상',
    className: 'status-tag--ok',
    summary: '현재 즉시 확인할 항목이 없습니다. 자동 튜닝 및 검증 절차는 정상 진행 중입니다.',
  },
  watch: {
    label: '관찰',
    className: '',
    summary: '진행 중인 검증과 관찰 항목이 있습니다. 즉시 조치할 항목은 없습니다.',
  },
  attention: {
    label: '확인 필요',
    className: 'status-tag--warning',
    summary: '아래 순서대로 상태를 확인하세요.',
  },
  'action-required': {
    label: '조치 필요',
    className: 'status-tag--warning',
    summary: '관리자 결정이 필요한 항목이 있습니다.',
  },
  unknown: {
    label: '판단 전',
    className: '',
    summary: '예측 실행 기록이 없습니다.',
  },
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

export function AdminOperationsStatus({
  center,
  stageLabel,
}: {
  center: OperationsStatusCenter;
  /** 기존 튜닝 단계 판정을 그대로 재사용한다. */
  stageLabel: string | null;
}) {
  const view = STATUS_VIEW[center.status];
  // 가장 먼저 확인 항목은 위에서 이미 강조하므로 목록에서 반복하지 않는다.
  const restItems = center.items.filter((item) => item.key !== center.primaryAction?.key);
  const visibleItems = restItems.slice(0, VISIBLE_ITEM_LIMIT);
  const hiddenItems = [...restItems.slice(VISIBLE_ITEM_LIMIT), ...center.observations];

  return (
    <SectionCard
      title="Forecast 운영 상태"
      badge={<span className={`status-tag ${view.className}`.trim()}>{view.label}</span>}
      description="지금 Forecast가 정상인지, 무엇부터 확인해야 하는지 한 곳에서 보여줍니다."
      className="admin-operations-status"
    >
      <div className="admin-detail-stack">
        <p className="admin-decision__note">{view.summary}</p>

        {center.primaryAction === null ? null : (
          <div className="admin-panel operations-status__primary">
            <span className="dashboard-shell__metric-label">가장 먼저 확인</span>
            <strong>{center.primaryAction.title}</strong>
            <p className="admin-decision__note">{center.primaryAction.detail}</p>
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

        {stageLabel === null ? null : (
          <p className="admin-decision__note">현재 단계 · {stageLabel}</p>
        )}
      </div>
    </SectionCard>
  );
}
