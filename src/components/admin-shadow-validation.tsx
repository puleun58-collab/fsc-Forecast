import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import { describeSensitivityParams } from '@/lib/forecast/parameter-sensitivity';
import {
  summarizeShadowValidation,
  type ShadowObservation,
  type ShadowSessionStatus,
  type ShadowStopReason,
  type ShadowValidationSession,
  type ShadowWindowMetrics,
} from '@/lib/forecast/shadow-validation';
import { getOpinetDisplayWeek, getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

const STATUS_VIEW: Record<ShadowSessionStatus, { label: string; className: string; summary: string }> = {
  validating: {
    label: '검증 중',
    className: 'status-tag--warning',
    summary: '새 Actual을 기준으로 운영 모델과 Shadow 후보를 동시에 검증하고 있습니다.',
  },
  reviewable: {
    label: '운영 적용 검토 가능',
    className: 'status-tag--ok',
    summary:
      'Shadow 검증에서 현재 운영 모델 대비 성능이 개선되었고 안정성 기준도 충족했습니다. 운영 모델은 아직 변경되지 않았습니다.',
  },
  failed: {
    label: '미통과',
    className: '',
    summary: '일부 지표는 개선되었지만 운영 변경에 필요한 안정성 조건을 충족하지 못했습니다.',
  },
  stopped: {
    label: '중단',
    className: '',
    summary: '비교 조건이 바뀌어 이번 Shadow 검증을 중단했습니다.',
  },
};

const STOP_REASON_TEXT: Record<ShadowStopReason, string> = {
  baseline_params_changed: '운영 모델 파라미터가 변경되었습니다.',
  model_version_changed: 'Forecast 모델 버전이 변경되었습니다.',
};

function describeWeekLabel(targetDate: string): string {
  const parsed = new Date(targetDate);

  if (Number.isNaN(parsed.getTime())) {
    return '주차 확인 불가';
  }

  const weekStart = getOpinetWeekStart(parsed);

  try {
    const display = getOpinetDisplayWeek(weekStart, getOpinetWeekEnd(weekStart));
    return `${display.month}월 ${display.weekOfMonth}주차`;
  } catch {
    return formatDashboardDate(parsed.toISOString());
  }
}

function formatMae(value: number | null): string {
  return value === null ? '산정 전' : formatPriceText(value);
}

function formatPercent(value: number | null, digits = 2): string {
  return value === null ? '산정 전' : `${value.toFixed(digits)}%`;
}

function formatRatioPercent(value: number | null): string {
  return value === null ? '산정 전' : `${(value * 100).toFixed(1)}%`;
}

function ComparisonRow({
  label,
  baseline,
  shadow,
  delta,
}: {
  label: string;
  baseline: string;
  shadow: string;
  delta: string;
}) {
  return (
    <tr>
      <th scope="row" data-label="지표">
        {label}
      </th>
      <td data-label="현재 운영">{baseline}</td>
      <td data-label="Shadow">{shadow}</td>
      <td data-label="차이">{delta}</td>
    </tr>
  );
}

function formatDelta(baseline: number | null, shadow: number | null, suffix: string, digits = 2): string {
  if (baseline === null || shadow === null) {
    return '비교 데이터 없음';
  }

  const delta = shadow - baseline;
  return `${delta > 0 ? '+' : ''}${delta.toFixed(digits)}${suffix}`;
}

function ObservationRow({ observation }: { observation: ShadowObservation }) {
  return (
    <tr>
      <th scope="row" data-label="주차">
        {describeWeekLabel(observation.targetDate)}
      </th>
      <td data-label="운영 Forecast">{formatPriceText(observation.baselineForecastKrwPerL)}</td>
      <td data-label="Shadow Forecast">{formatPriceText(observation.shadowForecastKrwPerL)}</td>
      <td data-label="Actual">
        {observation.actualKrwPerL === null ? '확정 대기' : formatPriceText(observation.actualKrwPerL)}
      </td>
      <td data-label="운영 오차">{formatMae(observation.baselineAbsoluteErrorKrwPerL)}</td>
      <td data-label="Shadow 오차">{formatMae(observation.shadowAbsoluteErrorKrwPerL)}</td>
      <td data-label="Shadow 방향">
        {observation.actualDirection === null ? (
          '확정 대기'
        ) : (
          <span
            className={`status-tag ${
              observation.shadowDirection === observation.actualDirection
                ? 'status-tag--ok'
                : 'status-tag--warning'
            }`}
          >
            {observation.shadowDirection === observation.actualDirection ? '방향 적중' : '방향 실패'}
          </span>
        )}
      </td>
    </tr>
  );
}

function ComparisonTable({
  baseline,
  shadow,
}: {
  baseline: ShadowWindowMetrics;
  shadow: ShadowWindowMetrics;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table shadow-validation__table">
        <thead>
          <tr>
            <th scope="col">지표</th>
            <th scope="col">현재 운영</th>
            <th scope="col">Shadow</th>
            <th scope="col">차이</th>
          </tr>
        </thead>
        <tbody>
          <ComparisonRow
            label="MAE"
            baseline={formatMae(baseline.maeKrwPerL)}
            shadow={formatMae(shadow.maeKrwPerL)}
            delta={formatDelta(baseline.maeKrwPerL, shadow.maeKrwPerL, '원/L')}
          />
          <ComparisonRow
            label="MAPE"
            baseline={formatPercent(baseline.mapePct)}
            shadow={formatPercent(shadow.mapePct)}
            delta={formatDelta(baseline.mapePct, shadow.mapePct, '%p')}
          />
          <ComparisonRow
            label="방향 정확도"
            baseline={formatRatioPercent(baseline.directionAccuracyRatio)}
            shadow={formatRatioPercent(shadow.directionAccuracyRatio)}
            delta={formatDelta(
              baseline.directionAccuracyRatio === null ? null : baseline.directionAccuracyRatio * 100,
              shadow.directionAccuracyRatio === null ? null : shadow.directionAccuracyRatio * 100,
              '%p',
              1,
            )}
          />
          <ComparisonRow
            label="최대 오차"
            baseline={formatMae(baseline.maxAbsoluteErrorKrwPerL)}
            shadow={formatMae(shadow.maxAbsoluteErrorKrwPerL)}
            delta={formatDelta(baseline.maxAbsoluteErrorKrwPerL, shadow.maxAbsoluteErrorKrwPerL, '원/L')}
          />
          <ComparisonRow
            label="Forecast 변동성"
            baseline={formatMae(baseline.forecastChurnKrwPerL)}
            shadow={formatMae(shadow.forecastChurnKrwPerL)}
            delta={formatDelta(baseline.forecastChurnKrwPerL, shadow.forecastChurnKrwPerL, '원/L')}
          />
        </tbody>
      </table>
    </div>
  );
}

export function AdminShadowValidation({ session }: { session: ShadowValidationSession | null }) {
  if (session === null) {
    return (
      <SectionCard
        title="Shadow 튜닝 후보 검증"
        badge="대기"
        description="개선 가능성이 있는 설정을 새 실제 데이터로 다시 검증합니다. 검증 결과가 좋아도 자동으로 적용되지는 않습니다."
        className="admin-shadow"
        emptyStateTitle="Shadow 검증 이력이 없습니다."
        emptyStateCopy="비교 분석에서 개선 후보가 나오면 다음 예측부터 실제 데이터로 검증을 시작합니다."
      />
    );
  }

  const summary = summarizeShadowValidation(session);
  const view = STATUS_VIEW[summary.status];

  return (
    <SectionCard
      title="Shadow 튜닝 후보 검증"
      badge={
        <span className={`status-tag ${view.className}`.trim()}>
          {summary.status === 'validating'
            ? `${view.label} · ${summary.completedSampleCount}/${summary.requiredSampleCount}`
            : view.label}
        </span>
      }
      description="개선 가능성이 있는 설정을 새 실제 데이터로 다시 검증합니다. 검증 결과가 좋아도 자동으로 적용되지는 않습니다."
      className="admin-shadow"
    >
      <div className="admin-detail-stack">
        <div className="admin-panel shadow-validation__status">
          <p className="quality-trend-status__summary">{view.summary}</p>
          {session.stoppedReason === null ? null : (
            <p className="quality-trend-status__notice">
              <span>{STOP_REASON_TEXT[session.stoppedReason]}</span>
            </p>
          )}
          <dl className="quality-trend-status__facts">
            <div>
              <dt>현재 운영</dt>
              <dd>{describeSensitivityParams(session.baselineParams)}</dd>
            </div>
            <div>
              <dt>Shadow 후보</dt>
              <dd>{describeSensitivityParams(session.candidateParams)}</dd>
            </div>
            <div>
              <dt>검증 시작</dt>
              <dd>{formatDashboardDate(session.startedAt)}</dd>
            </div>
            <div>
              <dt>표본</dt>
              <dd>
                {summary.completedSampleCount} / {summary.requiredSampleCount}
              </dd>
            </div>
          </dl>
        </div>

        <ComparisonTable baseline={summary.baseline} shadow={summary.shadow} />

        {summary.status === 'validating' ? (
          <p className="admin-decision__note">
            표본 {summary.requiredSampleCount}주가 확보되기 전까지는 중간 결과이며 우열을 판정하지 않습니다.
          </p>
        ) : null}

        <details className="admin-disclosure admin-disclosure--inline">
          <summary className="admin-disclosure__summary">
            <strong>판단 근거</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <dl className="quality-trend-status__facts">
              <div>
                <dt>표본</dt>
                <dd>
                  {summary.completedSampleCount} / {summary.requiredSampleCount}
                </dd>
              </div>
              <div>
                <dt>MAE·MAPE 개선</dt>
                <dd>{summary.qualityChecks.meetsMinimumImprovement ? '충족' : '미충족'}</dd>
              </div>
              <div>
                <dt>최대 오차</dt>
                <dd>{summary.qualityChecks.maxErrorStable ? '충족' : '미충족'}</dd>
              </div>
              <div>
                <dt>Forecast 변동성</dt>
                <dd>{summary.qualityChecks.churnStable ? '충족' : '미충족'}</dd>
              </div>
              <div>
                <dt>운영 변경 조건</dt>
                <dd>별도 cooldown 확인 필요</dd>
              </div>
            </dl>
          </div>
        </details>

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>Shadow 비교 상세</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            {session.observations.length === 0 ? (
              <p className="backtest-detail__empty">아직 발행된 Shadow 예측이 없습니다.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table shadow-validation__observations">
                  <thead>
                    <tr>
                      <th scope="col">주차</th>
                      <th scope="col">운영 Forecast</th>
                      <th scope="col">Shadow Forecast</th>
                      <th scope="col">Actual</th>
                      <th scope="col">운영 오차</th>
                      <th scope="col">Shadow 오차</th>
                      <th scope="col">Shadow 방향</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...session.observations]
                      .sort((left, right) => left.targetDate.localeCompare(right.targetDate))
                      .map((observation) => (
                        <ObservationRow key={observation.targetDate} observation={observation} />
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>

        <p className="admin-decision__note">
          Shadow 예측은 운영 Forecast, FSC, 신뢰도, 공개 대시보드에 사용하지 않는 진단 데이터입니다.
        </p>
      </div>
    </SectionCard>
  );
}
