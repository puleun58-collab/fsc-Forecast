import { AdminActionButton } from './admin-action-button';
import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import type { TransitionBlockReason } from '@/lib/forecast/model-transition';
import { describeBiasCorrection } from '@/lib/forecast/bias-correction';
import { describeDailySignal } from '@/lib/forecast/daily-signal';
import { describeIndicator, describeSensitivityParams } from '@/lib/forecast/parameter-sensitivity';
import type { ShadowValidationSummary } from '@/lib/forecast/shadow-validation';

export type TransitionViewStatus =
  | 'not-ready'
  | 'blocked'
  | 'approvable'
  | 'approved-pending'
  | 'applied';

export interface TransitionHistoryEntry {
  appliedAt: string | null;
  approvedAt: string;
  sourceKind: 'shadow_admin_approved' | 'post_transition_rollback';
  status: 'approved_pending' | 'applied' | 'cancelled';
  baselineParams: ForecastModelParams;
  candidateParams: ForecastModelParams;
}

export interface ModelTransitionView {
  status: TransitionViewStatus;
  blockReason: TransitionBlockReason | null;
  cooldownRemainingDays: number;
  baselineParams: ForecastModelParams;
  candidateParams: ForecastModelParams;
  summary: ShadowValidationSummary | null;
  approvedAt: string | null;
  appliedAt: string | null;
  request: {
    shadowSessionId: string;
    candidateFingerprint: string;
    sourceForecastRunId: string;
  } | null;
  history: TransitionHistoryEntry[];
}

const HISTORY_DISPLAY_LIMIT = 5;

const BLOCK_TEXT: Record<TransitionBlockReason, string> = {
  shadow_not_reviewable: '검증이 아직 완료되지 않아 전환할 수 없습니다.',
  sample_not_complete: '검증 표본이 아직 충분하지 않습니다.',
  baseline_mismatch: '현재 운영 설정이 검증 시작 시점과 달라 다시 확인이 필요합니다.',
  model_version_mismatch: '예측 모델 버전이 변경되어 다시 확인이 필요합니다.',
  candidate_equals_baseline: '후보가 이미 현재 운영 설정과 같습니다.',
  candidate_guardrail_broken: '최신 비교 분석에서 안정성 기준을 충족하지 못했습니다.',
  cooldown_active: '기존 운영 변경 보호 기간이 남아 있어 현재는 전환할 수 없습니다.',
  already_approved: '다른 운영 설정 변경이 이미 승인되어 적용을 기다리고 있습니다.',
};

const SOURCE_TEXT: Record<TransitionHistoryEntry['sourceKind'], string> = {
  shadow_admin_approved: '검증 후 관리자 승인',
  post_transition_rollback: '전환 후 성능 확인에 따른 이전 설정 복원',
};

const HISTORY_STATUS_TEXT: Record<TransitionHistoryEntry['status'], string> = {
  approved_pending: '적용 대기',
  applied: '적용 완료',
  cancelled: '취소됨',
};

const FACTOR_ROWS: { label: string; read: (params: ForecastModelParams) => string }[] = [
  { label: 'Trend lookback', read: (params) => `${params.trendLookbackWeeks}주` },
  { label: 'Dubai', read: (params) => describeIndicator(params.dubai) },
  { label: 'USD/KRW', read: (params) => describeIndicator(params.usdKrw) },
  {
    label: '외부 보정 Cap',
    read: (params) => `±${(params.externalAdjustmentCapRatio * 100).toFixed(0)}%`,
  },
  { label: 'Bias 보정', read: (params) => describeBiasCorrection(params.biasCorrection) },
  { label: '일별 단기 신호', read: (params) => describeDailySignal(params.dailySignal) },
];

export function ParameterDiffList({
  baselineParams,
  candidateParams,
}: {
  baselineParams: ForecastModelParams;
  candidateParams: ForecastModelParams;
}) {
  return (
    <dl className="transition-diff">
      {FACTOR_ROWS.map((row) => {
        const before = row.read(baselineParams);
        const after = row.read(candidateParams);
        const changed = before !== after;

        return (
          <div key={row.label} className={changed ? 'transition-diff__row--changed' : undefined}>
            <dt>{row.label}</dt>
            <dd>{changed ? `${before} → ${after}` : '동일'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function MetricRow({
  label,
  baseline,
  candidate,
}: {
  label: string;
  baseline: string;
  candidate: string;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td data-label="현재">{baseline}</td>
      <td data-label="후보">{candidate}</td>
    </tr>
  );
}

function formatValue(value: number | null): string {
  return value === null ? '산정 전' : formatPriceText(value);
}

function formatPercentValue(value: number | null, digits = 2): string {
  return value === null ? '산정 전' : `${value.toFixed(digits)}%`;
}

export function ComparisonMetricsTable({
  baselineLabel,
  candidateLabel,
  baseline,
  candidate,
}: {
  baselineLabel: string;
  candidateLabel: string;
  baseline: ShadowValidationSummary['baseline'];
  candidate: ShadowValidationSummary['shadow'];
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table transition-metrics">
        <thead>
          <tr>
            <th scope="col">지표</th>
            <th scope="col">{baselineLabel}</th>
            <th scope="col">{candidateLabel}</th>
          </tr>
        </thead>
        <tbody>
          <MetricRow
            label="13주 MAE"
            baseline={formatValue(baseline.maeKrwPerL)}
            candidate={formatValue(candidate.maeKrwPerL)}
          />
          <MetricRow
            label="13주 MAPE"
            baseline={formatPercentValue(baseline.mapePct)}
            candidate={formatPercentValue(candidate.mapePct)}
          />
          <MetricRow
            label="방향 정확도"
            baseline={formatPercentValue(
              baseline.directionAccuracyRatio === null ? null : baseline.directionAccuracyRatio * 100,
              1,
            )}
            candidate={formatPercentValue(
              candidate.directionAccuracyRatio === null ? null : candidate.directionAccuracyRatio * 100,
              1,
            )}
          />
          <MetricRow
            label="최대 오차"
            baseline={formatValue(baseline.maxAbsoluteErrorKrwPerL)}
            candidate={formatValue(candidate.maxAbsoluteErrorKrwPerL)}
          />
          <MetricRow
            label="Forecast 변동성"
            baseline={formatValue(baseline.forecastChurnKrwPerL)}
            candidate={formatValue(candidate.forecastChurnKrwPerL)}
          />
        </tbody>
      </table>
    </div>
  );
}

export function TransitionHistoryDisclosure({ history }: { history: TransitionHistoryEntry[] }) {
  if (history.length === 0) {
    return null;
  }

  return (
    <details className="admin-panel admin-disclosure">
      <summary className="admin-disclosure__summary">
        <strong>최근 운영 전환 이력</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <ul className="transition-history">
          {history.slice(0, HISTORY_DISPLAY_LIMIT).map((entry) => (
            <li key={`${entry.approvedAt}-${entry.sourceKind}`}>
              <strong>{formatDashboardDate(entry.appliedAt ?? entry.approvedAt)}</strong>
              <ParameterDiffList
                baselineParams={entry.baselineParams}
                candidateParams={entry.candidateParams}
              />
              <span className="transition-history__meta">
                {SOURCE_TEXT[entry.sourceKind]} · {HISTORY_STATUS_TEXT[entry.status]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

const STATUS_BADGE: Record<TransitionViewStatus, { label: string; className: string }> = {
  'not-ready': { label: '대기', className: '' },
  blocked: { label: '전환 대기', className: 'status-tag--warning' },
  approvable: { label: '전환 가능', className: 'status-tag--ok' },
  'approved-pending': { label: '승인 완료', className: 'status-tag--ok' },
  applied: { label: '전환 완료', className: 'status-tag--ok' },
};

export function AdminModelTransition({ view }: { view: ModelTransitionView }) {
  if (view.status === 'not-ready') {
    return (
      <SectionCard
        title="운영 전환 검토"
        badge="대기"
        description="검증을 통과한 설정을 관리자가 확인한 뒤에만 운영 예측 설정으로 전환합니다."
        className="admin-transition"
        emptyStateTitle="전환을 검토할 후보가 없습니다."
        emptyStateCopy="검증이 완료되면 현재 설정과 후보 설정을 비교해 전환 여부를 결정할 수 있습니다."
      >
        <TransitionHistoryDisclosure history={view.history} />
      </SectionCard>
    );
  }

  const badge = STATUS_BADGE[view.status];

  return (
    <SectionCard
      title="운영 전환 검토"
      badge={<span className={`status-tag ${badge.className}`.trim()}>{badge.label}</span>}
      description="검증을 통과한 설정을 관리자가 확인한 뒤에만 운영 예측 설정으로 전환합니다."
      className="admin-transition"
    >
      <div className="admin-detail-stack">
        {view.status === 'approved-pending' ? (
          <div className="admin-panel transition-status">
            <dl className="quality-trend-status__facts">
              <div>
                <dt>운영 전환</dt>
                <dd>승인 완료</dd>
              </div>
              <div>
                <dt>적용 상태</dt>
                <dd>다음 예측 실행 대기</dd>
              </div>
            </dl>
            <p className="quality-trend-status__summary">
              다음 예측이 성공적으로 실행되면 새 예측 설정이 적용됩니다.
            </p>
          </div>
        ) : null}

        {view.status === 'applied' ? (
          <div className="admin-panel transition-status">
            <dl className="quality-trend-status__facts">
              <div>
                <dt>운영 전환</dt>
                <dd>완료</dd>
              </div>
              <div>
                <dt>적용 시각</dt>
                <dd>{view.appliedAt === null ? '기록 없음' : formatDashboardDate(view.appliedAt)}</dd>
              </div>
              <div>
                <dt>검증 근거</dt>
                <dd>새 실제 데이터 {view.summary?.requiredSampleCount ?? 13}주 비교</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="admin-panel transition-compare">
          <div>
            <span className="dashboard-shell__metric-label">현재 운영</span>
            <p>{describeSensitivityParams(view.baselineParams)}</p>
          </div>
          <div>
            <span className="dashboard-shell__metric-label">전환 후보</span>
            <p>{describeSensitivityParams(view.candidateParams)}</p>
          </div>
        </div>

        <ParameterDiffList
          baselineParams={view.baselineParams}
          candidateParams={view.candidateParams}
        />

        {view.summary === null ? null : (
          <ComparisonMetricsTable
            baselineLabel="현재"
            candidateLabel="후보"
            baseline={view.summary.baseline}
            candidate={view.summary.shadow}
          />
        )}

        {view.status === 'blocked' && view.blockReason !== null ? (
          <p className="quality-trend-status__notice">
            <span>
              {BLOCK_TEXT[view.blockReason]}
              {view.blockReason === 'cooldown_active' && view.cooldownRemainingDays > 0
                ? ` 운영 전환 가능까지 ${view.cooldownRemainingDays}일 남았습니다.`
                : ''}
            </span>
          </p>
        ) : null}

        {view.status === 'approvable' && view.request !== null ? (
          <AdminActionButton
            label="운영 전환 승인"
            endpoint="/api/admin/forecast-model-transition/approve"
            payload={view.request}
            confirmMessage="검증이 완료된 후보를 운영 예측 설정으로 전환 승인합니다. 현재 Forecast 및 FSC 결과는 변경되지 않으며, 다음 예측 성공 실행부터 새 설정이 적용됩니다. 계속하시겠습니까?"
          />
        ) : null}

        {view.status === 'approved-pending' ? (
          <AdminActionButton
            label="전환 승인 취소"
            endpoint="/api/admin/forecast-model-transition/cancel"
            variant="danger"
            confirmMessage="아직 적용되지 않은 운영 전환 승인을 취소합니다. 계속하시겠습니까?"
          />
        ) : null}

        <TransitionHistoryDisclosure history={view.history} />

        <p className="admin-decision__note">
          승인 시점에는 현재 예측과 FSC 결과가 바뀌지 않으며, 다음 예측 성공 실행부터 새 설정이 사용됩니다.
        </p>
      </div>
    </SectionCard>
  );
}
