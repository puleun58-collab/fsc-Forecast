import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatDashboardDate, formatDashboardDateTime } from '@/lib/dashboard/dashboard-time';
import type { DataHealthStatus, DataHealthSummary } from '@/lib/data-health/data-health';
import type {
  DataQualityStatus,
  ForecastInputQuality,
  ForecastInputQualityLevel,
  ForecastInputSource,
} from '@/lib/forecast/input-quality';

const STATUS_VIEW: Record<DataHealthStatus, { label: string; className: string }> = {
  healthy: { label: '최신', className: 'status-tag--ok' },
  delayed: { label: '지연', className: 'status-tag--warning' },
  error: { label: '오류', className: 'status-tag--critical' },
  missing: { label: '데이터 없음', className: '' },
};

const INPUT_SOURCE_LABEL: Record<ForecastInputSource, string> = {
  weeklyDiesel: '주간 경유가',
  dailyDiesel: '일별 경유가',
  dubai: 'Dubai',
  usdKrw: 'USD/KRW',
};

const INPUT_STATUS_LABEL: Record<DataQualityStatus, string> = {
  healthy: '정상',
  stale: '데이터 지연',
  missing: '데이터 없음',
  insufficient: '표본 부족',
  invalid: '비정상 데이터',
  duplicate: '중복 데이터 정리됨',
  unavailable: '일시적으로 사용할 수 없음',
};

const INPUT_LEVEL_VIEW: Record<
  ForecastInputQualityLevel,
  { label: string; className: string; summary: string }
> = {
  ok: {
    label: '정상',
    className: 'status-tag--ok',
    summary: '이번 예측은 필요한 입력 데이터를 모두 사용했습니다.',
  },
  attention: {
    label: '주의',
    className: 'status-tag--warning',
    summary: '예측은 정상 생성되었지만 일부 보조 데이터를 사용하지 않았습니다.',
  },
  'action-required': {
    label: '확인 필요',
    className: 'status-tag--critical',
    summary: '필수 데이터를 사용할 수 없어 정상 예측을 계산할 수 없습니다.',
  },
};

function ForecastInputQualitySection({ quality }: { quality: ForecastInputQuality }) {
  const view = INPUT_LEVEL_VIEW[quality.level];

  return (
    <div className="admin-panel input-quality">
      <div className="input-quality__head">
        <strong>이번 예측 입력 상태</strong>
        <span className={`status-tag ${view.className}`.trim()}>{view.label}</span>
      </div>
      <p className="admin-decision__note">{view.summary}</p>
      <details className="admin-disclosure admin-disclosure--inline">
        <summary className="admin-disclosure__summary">
          <strong>데이터 상태 상세 보기</strong>
          <AdminDisclosureToggle />
        </summary>
        <div className="admin-disclosure__body">
          <div className="admin-table-wrap">
            <table className="admin-table input-quality-table">
              <thead>
                <tr>
                  <th scope="col">데이터</th>
                  <th scope="col">상태</th>
                  <th scope="col">최신 기준</th>
                  <th scope="col">Forecast 사용</th>
                </tr>
              </thead>
              <tbody>
                {quality.results.map((item) => (
                  <tr key={item.source}>
                    <th scope="row" data-label="데이터">
                      {INPUT_SOURCE_LABEL[item.source]}
                    </th>
                    <td data-label="상태">{INPUT_STATUS_LABEL[item.status]}</td>
                    <td data-label="최신 기준">
                      {item.latestDataDate === null
                        ? `표본 ${item.sampleCount}개`
                        : formatDashboardDate(item.latestDataDate)}
                    </td>
                    <td data-label="Forecast 사용">{item.usable ? '사용' : '미사용'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}

export function AdminDataHealthPanel({
  summary,
  inputQuality = null,
}: {
  summary: DataHealthSummary;
  inputQuality?: ForecastInputQuality | null;
}) {
  const summaryView = STATUS_VIEW[summary.status];

  return (
    <SectionCard
      title="데이터 상태"
      badge={
        <span
          className={[
            'status-tag',
            summary.status === 'healthy' ? '' : 'status-tag--prominent',
            summaryView.className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {summary.label}
        </span>
      }
      description="Forecast 입력 데이터의 최신 상태를 확인합니다."
      className="admin-data-health"
    >
      {inputQuality === null ? null : <ForecastInputQualitySection quality={inputQuality} />}
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
                          <AdminDisclosureToggle />
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
