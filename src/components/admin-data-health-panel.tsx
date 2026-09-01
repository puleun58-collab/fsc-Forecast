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
      description="Forecast 입력 데이터의 최신 상태를 확인합니다."
      className="admin-data-health"
    >
      <div className="admin-table-wrap">
        <table className="admin-table data-health-table">
          <thead>
            <tr>
              <th scope="col">데이터 소스</th>
              <th scope="col">상태</th>
              <th scope="col">최신 데이터</th>
              <th scope="col">최근 성공 수집</th>
            </tr>
          </thead>
          <tbody>
            {summary.items.map((item) => {
              const statusView = STATUS_VIEW[item.status];
              const latestDataText =
                item.latestDataLabel ??
                (item.latestDataAt === null ? '기록 없음' : formatDashboardDate(item.latestDataAt));

              return (
                <tr key={item.sourceCode} className={`data-health-table__row data-health-table__row--${item.status}`}>
                  <th scope="row" data-label="데이터 소스">
                    {item.source}
                  </th>
                  <td data-label="상태">
                    <span className={`status-tag ${statusView.className}`.trim()}>{statusView.label}</span>
                    {item.delayLabel ? (
                      <span className="data-health-table__delay">{item.delayLabel}</span>
                    ) : null}
                  </td>
                  <td data-label="최신 데이터">{latestDataText}</td>
                  <td data-label="최근 성공 수집">
                    {formatDashboardDateTime(item.lastCollectedAt)}
                    {item.status === 'error' && item.errorMessage ? (
                      <details className="data-health-table__error">
                        <summary>
                          <span>오류 상세</span>
                          <span className="admin-disclosure__toggle" aria-hidden="true">
                            <span className="admin-disclosure__toggle-closed">상세 보기 ▾</span>
                            <span className="admin-disclosure__toggle-open">상세 접기 ▴</span>
                          </span>
                        </summary>
                        <p>{item.errorMessage}</p>
                        {item.errorAt ? <span>최근 오류 {formatDashboardDateTime(item.errorAt)}</span> : null}
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
