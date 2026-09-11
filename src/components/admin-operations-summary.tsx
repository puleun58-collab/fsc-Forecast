import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';
import type { CandidatePersistence } from '@/lib/forecast/candidate-persistence';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import {
  listModelParamFields,
  type ModelParamFieldKey,
} from '@/lib/forecast/describe-model-params';
import type { PerformanceDrift, PerformanceDriftStatus } from '@/lib/forecast/performance-drift';
import type { ModelTransitionView } from './admin-model-transition';
import type { PostTransitionView } from './admin-post-transition';
import type { ShadowValidationSession } from '@/lib/forecast/shadow-validation';
import { summarizeShadowValidation } from '@/lib/forecast/shadow-validation';

export interface NextStepInput {
  persistence: CandidatePersistence | null;
  tuningCandidateCount: number;
  shadow: ShadowValidationSession | null;
  transition: ModelTransitionView;
  postTransition: PostTransitionView | null;
}

export interface AdminOperationsSummaryProps {
  modelParams: ForecastModelParams | null;
  recentMapePct: number | null;
  recentMaeKrwPerL: number | null;
  recentSampleCount: number | null;
  reliabilityGrade: string | null;
  /** 최근 성능 드리프트 진단. 기능 적용 이전 run에서는 null이다. */
  drift?: PerformanceDrift | null;
}

interface NextStep {
  label: string;
  tone: 'action' | 'progress' | 'idle';
  detail: string;
}

function formatMape(value: number | null): string {
  return value === null ? '산정 전' : `${value.toFixed(2)}%`;
}

function formatMae(value: number | null): string {
  return value === null ? '산정 전' : formatPriceText(value);
}

function formatSummaryModelParams(params: ForecastModelParams): readonly [string, string] {
  const values = Object.fromEntries(
    listModelParamFields(params).map(({ key, value }) => [key, value]),
  ) as Record<ModelParamFieldKey, string>;
  const value = (key: ModelParamFieldKey): string => values[key];
  const dubai =
    params.dubai === null
      ? 'Dubai · 미사용'
      : `Dubai · Forecast 반영 시차 ${value('dubaiLag')} · 비중 ${value('dubaiWeight')}`;
  const usdKrw =
    params.usdKrw === null
      ? 'USD/KRW · 미사용'
      : `USD/KRW · ${value('usdKrw').replace('반영 시차', 'Forecast 반영 시차')}`;

  return [
    `추세 기간 ${value('trend')} · ${dubai}`,
    [
      usdKrw,
      `외부 보정 상한 ${value('cap')}`,
      ...(params.biasCorrection === null ? [] : [`편향 보정 ${value('bias')}`]),
      ...(params.dailySignal === null ? [] : [`일별 단기 신호 ${value('dailySignal')}`]),
    ].join(' · '),
  ];
}

/**
 * 관리자가 지금 해야 할 일 하나만 고른다. 조치가 필요한 상태를 항상 앞세운다.
 * 진행 단계 표시는 `Forecast 운영 상태` 카드가 단독으로 담당하므로 결과는 그쪽에서만 렌더한다.
 */
export function resolveNextStep({
  persistence,
  tuningCandidateCount,
  shadow,
  transition,
  postTransition,
}: NextStepInput): NextStep {
  if (postTransition !== null && postTransition.summary.status === 'rollback_reviewable') {
    return {
      label: '롤백 검토 필요',
      tone: 'action',
      detail: '전환 이후 성능이 이전 설정보다 나빠 롤백 승인 여부를 확인해야 합니다.',
    };
  }

  if (transition.status === 'approvable') {
    return {
      label: '운영 전환 승인 필요',
      tone: 'action',
      detail: 'Shadow 검증을 통과한 후보가 관리자 승인을 기다리고 있습니다.',
    };
  }

  if (transition.status === 'approved-pending') {
    return {
      label: '전환 적용 대기',
      tone: 'progress',
      detail: '승인된 전환이 다음 예측 실행에서 적용됩니다.',
    };
  }

  if (postTransition !== null && postTransition.summary.status === 'monitoring') {
    return {
      label: `전환 후 성능 확인 중 · ${postTransition.summary.completedSampleCount}/${postTransition.summary.requiredSampleCount}주`,
      tone: 'progress',
      detail: '전환한 설정과 이전 설정을 새 실제 데이터로 비교하고 있습니다.',
    };
  }

  if (shadow !== null) {
    const summary = summarizeShadowValidation(shadow);

    if (summary.status === 'validating') {
      return {
        label: `Shadow 검증 중 · ${summary.completedSampleCount}/${summary.requiredSampleCount}주`,
        tone: 'progress',
        detail: '후보 설정을 새 실제 데이터로 검증하고 있습니다.',
      };
    }

    if (summary.status === 'reviewable') {
      return {
        label: 'Shadow 검증 완료 · 운영 적용 검토 가능',
        tone: 'action',
        detail: '검증을 통과한 후보가 있으며 운영 적용은 관리자 승인이 필요합니다.',
      };
    }
  }

  if (persistence !== null && persistence.candidateFingerprint !== null) {
    return {
      label: `1순위 후보 연속 확인 ${persistence.confirmedCount}/${persistence.requiredCount}주`,
      tone: 'progress',
      detail: '같은 후보가 다음 주에도 1순위를 유지하면 Shadow 검증을 시작합니다.',
    };
  }

  return {
    label: tuningCandidateCount === 0 ? '튜닝 후보 없음' : `튜닝 후보 ${tuningCandidateCount}건 검토 중`,
    tone: 'idle',
    detail:
      tuningCandidateCount === 0
        ? '현재 운영 설정보다 명확히 나은 후보가 없습니다.'
        : '후보가 다음 새 주간 데이터에서도 기준을 통과하면 확인 단계로 넘어갑니다.',
  };
}

const DRIFT_VIEW: Record<PerformanceDriftStatus, { label: string; className: string }> = {
  stable: {
    label: '안정',
    className: 'status-tag--ok',
  },
  watch: {
    label: '관찰',
    className: '',
  },
  alert: {
    label: '악화 감지',
    className: 'status-tag--warning',
  },
  undecided: {
    label: '판단 보류',
    className: '',
  },
};

function ForecastPerformanceStatus({ drift }: { drift: PerformanceDrift }) {
  const view = DRIFT_VIEW[drift.status];

  return (
    <div className="admin-summary__performance">
      <div className="admin-summary__performance-head">
        <span className="dashboard-shell__metric-label">Forecast 성능 상태</span>
        <span className={`status-tag ${view.className}`.trim()}>{view.label}</span>
      </div>
    </div>
  );
}

export function AdminOperationsSummary({
  modelParams,
  recentMapePct,
  recentMaeKrwPerL,
  recentSampleCount,
  reliabilityGrade,
  drift = null,
}: AdminOperationsSummaryProps) {
  if (modelParams === null) {
    return (
      <SectionCard
        title="운영 요약"
        badge="예측 없음"
        description="현재 운영 중인 예측 설정과 최근 성능을 한눈에 보여줍니다."
        className="admin-summary"
        emptyStateTitle="예측 실행 기록이 없습니다."
        emptyStateCopy="다음 예측 실행부터 운영 상태가 표시됩니다."
      />
    );
  }

  const parameterLines = formatSummaryModelParams(modelParams);

  return (
    <SectionCard
      title="운영 요약"
      badge={
        <span
          className="status-tag status-tag--prominent status-tag--brand admin-summary__operating-chip"
          aria-label={`현재 운영 · Model ${modelParams.modelId}`}
        >
          <span className="admin-summary__operating-label" aria-hidden="true">현재 운영</span>
          <span className="admin-summary__operating-separator" aria-hidden="true">·</span>
          <strong aria-hidden="true">Model {modelParams.modelId}</strong>
        </span>
      }
      description="현재 운영 중인 예측 설정과 최근 성능을 한눈에 보여줍니다."
      className="admin-summary"
    >
      <div className="admin-detail-stack">
        <div className="admin-metric-grid">
          {[
            ['신뢰도 등급', reliabilityGrade ?? '산정 전'],
            ['최근 13주 MAPE', formatMape(recentMapePct)],
            ['최근 13주 MAE', formatMae(recentMaeKrwPerL)],
            ['평가 표본', recentSampleCount === null ? '산정 전' : `${recentSampleCount}주`],
          ].map(([label, value]) => (
            <div key={label} className="admin-metric">
              <span className="dashboard-shell__metric-label">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="admin-summary__params" aria-label="현재 운영 설정">
          {parameterLines.map((line) => (
            <p key={line} className="admin-decision__note">
              {line}
            </p>
          ))}
        </div>

        {drift === null ? null : <ForecastPerformanceStatus drift={drift} />}

        <details className="admin-disclosure admin-disclosure--inline admin-summary__metric-help">
          <summary className="admin-disclosure__summary">
            <strong>성능 지표 설명</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <p className="admin-decision__note">
              최근 13주의 다음 주 예측 결과를 기준으로 산정한 성능입니다.
            </p>
            <dl className="admin-summary__metric-definitions">
              <div>
                <dt>MAE</dt>
                <dd>실제 가격과 평균 몇 원/L 차이였는지를 나타냅니다.</dd>
              </div>
              <div>
                <dt>MAPE</dt>
                <dd>실제 가격과 평균 몇 % 차이였는지를 나타냅니다.</dd>
              </div>
            </dl>
          </div>
        </details>
      </div>
    </SectionCard>
  );
}
