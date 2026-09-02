import { AdminActionButton } from './admin-action-button';
import { ComparisonMetricsTable, ParameterDiffList } from './admin-model-transition';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import type {
  PostTransitionMonitoring,
  PostTransitionStatus,
  PostTransitionSummary,
} from '@/lib/forecast/post-transition-monitoring';

export interface PostTransitionView {
  monitoring: PostTransitionMonitoring;
  summary: PostTransitionSummary;
  rollbackApprovable: boolean;
  rollbackBlockedText: string | null;
  earlyWarningText: string | null;
  request: {
    sourceTransitionId: string;
    sourceForecastRunId: string;
    rollbackFingerprint: string;
  } | null;
}

const STATUS_VIEW: Record<PostTransitionStatus, { label: string; className: string; summary: string }> = {
  monitoring: {
    label: '모니터링 중',
    className: 'status-tag--warning',
    summary: '새 설정 적용 후 실제 데이터를 기준으로 현재 설정과 이전 설정을 비교하고 있습니다.',
  },
  stable: {
    label: '안정',
    className: 'status-tag--ok',
    summary: '전환 후 새 실제 데이터를 기준으로 현재 설정이 안정적으로 운영되고 있습니다.',
  },
  rollback_reviewable: {
    label: '롤백 검토 필요',
    className: 'status-tag--warning',
    summary: '전환 이후 실제 데이터에서는 이전 설정의 예측 오차가 더 작았습니다.',
  },
  rolled_back: {
    label: '롤백 완료',
    className: '',
    summary: '이전 설정으로 되돌린 뒤 이 비교는 종료되었습니다.',
  },
  stopped: {
    label: '중단',
    className: '',
    summary: '비교 조건이 바뀌어 전환 후 성능 비교를 중단했습니다.',
  },
};

const STOP_REASON_TEXT: Record<'model_version_changed' | 'current_params_changed', string> = {
  model_version_changed: '예측 모델 버전이 변경되었습니다.',
  current_params_changed: '운영 예측 설정이 다른 이유로 변경되었습니다.',
};

export function AdminPostTransition({ view }: { view: PostTransitionView | null }) {
  if (view === null) {
    return null;
  }

  const { monitoring, summary } = view;
  const status = STATUS_VIEW[summary.status];

  return (
    <SectionCard
      title="운영 전환 후 성능"
      badge={
        <span className={`status-tag ${status.className}`.trim()}>
          {summary.status === 'monitoring'
            ? `${status.label} · ${summary.completedSampleCount}/${summary.requiredSampleCount}`
            : status.label}
        </span>
      }
      description="새 설정으로 바꾼 뒤에도 같은 주차에서 이전 설정과 예측 오차를 비교합니다. 결과가 나빠도 자동으로 되돌리지 않습니다."
      className="admin-post-transition"
    >
      <div className="admin-detail-stack">
        <div className="admin-panel transition-status">
          <p className="quality-trend-status__summary">{status.summary}</p>
          {monitoring.stoppedReason === null ? null : (
            <p className="quality-trend-status__notice">
              <span>{STOP_REASON_TEXT[monitoring.stoppedReason]}</span>
            </p>
          )}
          {view.earlyWarningText === null ? null : (
            <p className="quality-trend-status__notice">
              <span>{view.earlyWarningText}</span>
            </p>
          )}
          <dl className="quality-trend-status__facts">
            <div>
              <dt>비교 시작</dt>
              <dd>{formatDashboardDate(monitoring.startedAt)}</dd>
            </div>
            <div>
              <dt>표본</dt>
              <dd>
                {summary.completedSampleCount} / {summary.requiredSampleCount}
              </dd>
            </div>
          </dl>
        </div>

        <ParameterDiffList
          baselineParams={monitoring.rollbackParams}
          candidateParams={monitoring.currentParams}
        />

        <ComparisonMetricsTable
          baselineLabel="현재"
          candidateLabel="이전 설정"
          baseline={summary.current}
          candidate={summary.rollback}
        />

        {summary.status === 'monitoring' ? (
          <p className="admin-decision__note">
            표본 {summary.requiredSampleCount}주가 확보되기 전까지는 중간 결과이며 우열을 판정하지 않습니다.
          </p>
        ) : null}

        {view.rollbackBlockedText === null ? null : (
          <p className="quality-trend-status__notice">
            <span>{view.rollbackBlockedText}</span>
          </p>
        )}

        {view.rollbackApprovable && view.request !== null ? (
          <AdminActionButton
            label="이전 설정으로 롤백 승인"
            endpoint="/api/admin/forecast-model-transition/rollback"
            payload={view.request}
            variant="danger"
            confirmMessage="현재 운영 예측 설정을 전환 이전 설정으로 되돌리도록 승인합니다. 현재 Forecast 및 FSC 결과는 변경되지 않으며, 다음 예측 성공 실행부터 이전 설정이 다시 적용됩니다. 계속하시겠습니까?"
          />
        ) : null}

        <p className="admin-decision__note">
          이전 설정 예측은 비교용 진단 데이터이며 운영 Forecast, FSC, 신뢰도, 공개 대시보드에 사용하지 않습니다.
        </p>
      </div>
    </SectionCard>
  );
}
