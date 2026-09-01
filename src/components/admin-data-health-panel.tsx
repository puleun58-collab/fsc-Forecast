import { SectionCard } from './section-card';

import { formatDashboardDate, formatDashboardDateTime } from '@/lib/dashboard/dashboard-time';
import type { DataHealthStatus, DataHealthSummary } from '@/lib/data-health/data-health';

const STATUS_VIEW: Record<DataHealthStatus, { label: string; className: string }> = {
  healthy: { label: '최신', className: 'status-tag--ok' },
  delayed: { label: '지연', className: 'status-tag--warning' },
  error: { label: '오류', className: 'status-tag--critical' },
  missing: { label: '데이터 없음', className: '' },
};

export function AdminDataHealthPanel({ summary }: { summary: DataHealthSummary }) {
  const summaryView = STATUS_VIEW[summary.status];

  return (
    <SectionCard
      title="데이터 상태"
      badge={
        <span className={`status-tag ${summaryView.className}`.trim()}>{summary.label}</span>
      }
      description="Forecast 입력 데이터의 최신 상태를 확인합니다. 상태 표시는 예측 실행을 차단하지 않습니다."
      className="admin-data-health"
    >
      <ul className="data-health-list">
        {summary.items.map((item) => {
          const statusView = STATUS_VIEW[item.status];
          const latestDataText =
            item.latestDataLabel ??
            (item.latestDataAt === null ? '기록 없음' : formatDashboardDate(item.latestDataAt));

          return (
            <li key={item.sourceCode} className={`data-health-row data-health-row--${item.status}`}>
              <strong className="data-health-row__source">{item.source}</strong>
              <span className={`status-tag ${statusView.className}`.trim()}>{statusView.label}</span>
              <span className="data-health-row__metric">
                <span>최신 데이터</span>
                <strong>{latestDataText}</strong>
              </span>
              <span className="data-health-row__metric">
                <span>최근 성공 수집</span>
                <strong>{formatDashboardDateTime(item.lastCollectedAt)}</strong>
              </span>
              {item.delayLabel ? <span className="data-health-row__delay">{item.delayLabel}</span> : null}
              {item.status === 'error' && item.errorMessage ? (
                <details className="data-health-row__error">
                  <summary>오류 상세 보기</summary>
                  <p>{item.errorMessage}</p>
                  {item.errorAt ? <span>최근 오류 {formatDashboardDateTime(item.errorAt)}</span> : null}
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
