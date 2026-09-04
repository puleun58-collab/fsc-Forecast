import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';
import type { CandidatePersistence } from '@/lib/forecast/candidate-persistence';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import { formatModelParams } from '@/lib/forecast/describe-model-params';
import type { PerformanceDrift, PerformanceDriftStatus } from '@/lib/forecast/performance-drift';
import type { ModelTransitionView } from './admin-model-transition';
import type { PostTransitionView } from './admin-post-transition';
import type { ShadowValidationSession } from '@/lib/forecast/shadow-validation';
import { summarizeShadowValidation } from '@/lib/forecast/shadow-validation';

export interface AdminOperationsSummaryProps {
  modelParams: ForecastModelParams | null;
  recentMapePct: number | null;
  recentMaeKrwPerL: number | null;
  recentSampleCount: number | null;
  reliabilityGrade: string | null;
  persistence: CandidatePersistence | null;
  tuningCandidateCount: number;
  shadow: ShadowValidationSession | null;
  transition: ModelTransitionView;
  postTransition: PostTransitionView | null;
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

/** 관리자가 지금 해야 할 일 하나만 고른다. 조치가 필요한 상태를 항상 앞세운다. */
export function resolveNextStep({
  persistence,
  tuningCandidateCount,
  shadow,
  transition,
  postTransition,
}: Pick<
  AdminOperationsSummaryProps,
  'persistence' | 'tuningCandidateCount' | 'shadow' | 'transition' | 'postTransition'
>): NextStep {
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
      label: `동일 후보 확인 ${persistence.confirmedCount}/${persistence.requiredCount}주`,
      tone: 'progress',
      detail: '같은 후보가 새 주간 데이터에서 한 번 더 통과하면 Shadow 검증을 시작합니다.',
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

const DRIFT_VIEW: Record<PerformanceDriftStatus, { label: string; className: string; detail: string }> = {
  stable: {
    label: '안정',
    className: 'status-tag--ok',
    detail: '최근 4주 예측 오차가 최근 13주 수준과 비슷합니다.',
  },
  watch: {
    label: '관찰',
    className: '',
    detail: '최근 4주 MAE가 최근 13주 평균보다 높아졌습니다.',
  },
  alert: {
    label: '악화 감지',
    className: 'status-tag--warning',
    detail:
      '최근 새 실제 데이터에서 예측 오차 증가가 반복되고 있습니다. 입력 데이터 상태 → 시장 국면 → 신호 기여도 → 실전 신호 검증 → 튜닝 후보 순으로 확인하세요.',
  },
  undecided: {
    label: '판단 보류',
    className: '',
    detail: '최근 실제 데이터가 부족해 성능 변화 판단을 보류합니다.',
  },
};

const DRIFT_EXTRA_REASON_TEXT: Partial<Record<PerformanceDrift['reasons'][number], string>> = {
  'single-large-error': '최근 4주에 단일 큰 오차가 있었습니다.',
  'direction-accuracy-down': '최근 4주 방향 적중률이 낮아졌습니다.',
};

function PerformanceDriftBlock({ drift }: { drift: PerformanceDrift }) {
  const view = DRIFT_VIEW[drift.status];

  return (
    <div className="admin-panel performance-drift">
      <div className="performance-drift__head">
        <strong>Forecast 성능 상태</strong>
        <span className={`status-tag ${view.className}`.trim()}>{view.label}</span>
      </div>
      <div className="admin-metric-grid">
        {[
          ['최근 4주 MAE', formatMae(drift.short.maeKrwPerL)],
          ['최근 13주 MAE', formatMae(drift.medium.maeKrwPerL)],
          ['최근 26주 MAE', formatMae(drift.long.maeKrwPerL)],
        ].map(([label, value]) => (
          <div key={label} className="admin-metric">
            <span className="dashboard-shell__metric-label">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="admin-decision__note">{view.detail}</p>
      {drift.reasons.flatMap((reason) => {
        const text = DRIFT_EXTRA_REASON_TEXT[reason];

        return text === undefined ? [] : [
          <p key={reason} className="admin-decision__note">
            {text}
          </p>,
        ];
      })}
      <details className="admin-disclosure admin-disclosure--inline">
        <summary className="admin-disclosure__summary">
          <span>성능 변화 상세 보기</span>
          <AdminDisclosureToggle />
        </summary>
        <div className="admin-disclosure__body">
          <div className="admin-table-wrap">
            <table className="admin-table performance-drift-table">
              <thead>
                <tr>
                  <th scope="col">구간</th>
                  <th scope="col">표본</th>
                  <th scope="col">MAE</th>
                  <th scope="col">MAPE</th>
                  <th scope="col">최대 오차</th>
                  <th scope="col">방향 정확도</th>
                </tr>
              </thead>
              <tbody>
                {[drift.short, drift.medium, drift.long].map((window) => (
                  <tr key={window.windowWeeks}>
                    <th scope="row" data-label="구간">
                      최근 {window.windowWeeks}주
                    </th>
                    <td data-label="표본">{window.sampleCount}주</td>
                    <td data-label="MAE">{formatMae(window.maeKrwPerL)}</td>
                    <td data-label="MAPE">{formatMape(window.mapePct)}</td>
                    <td data-label="최대 오차">{formatMae(window.maxAbsoluteErrorKrwPerL)}</td>
                    <td data-label="방향 정확도">
                      {window.directionAccuracyRatio === null
                        ? '산정 전'
                        : `${(window.directionAccuracyRatio * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-decision__note">
            성능 상태는 진단 경보이며 후보 순위·Shadow·운영 전환을 자동으로 바꾸지 않습니다.
          </p>
        </div>
      </details>
    </div>
  );
}

export function AdminOperationsSummary({
  modelParams,
  recentMapePct,
  recentMaeKrwPerL,
  recentSampleCount,
  reliabilityGrade,
  persistence,
  tuningCandidateCount,
  shadow,
  transition,
  postTransition,
  drift = null,
}: AdminOperationsSummaryProps) {
  if (modelParams === null) {
    return (
      <SectionCard
        title="운영 요약"
        badge="예측 없음"
        description="현재 운영 중인 예측 설정과 최근 성능, 다음 확인 단계를 한눈에 보여줍니다."
        className="admin-summary"
        emptyStateTitle="예측 실행 기록이 없습니다."
        emptyStateCopy="다음 예측 실행부터 운영 상태가 표시됩니다."
      />
    );
  }

  const nextStep = resolveNextStep({
    persistence,
    tuningCandidateCount,
    shadow,
    transition,
    postTransition,
  });

  return (
    <SectionCard
      title="운영 요약"
      badge={`현재 Model ${modelParams.modelId}`}
      description="현재 운영 중인 예측 설정과 최근 성능, 다음 확인 단계를 한눈에 보여줍니다."
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

        <p className="admin-decision__note">{formatModelParams(modelParams)}</p>

        <div className={`admin-summary__next admin-summary__next--${nextStep.tone}`}>
          <span
            className={`status-tag ${
              nextStep.tone === 'action'
                ? 'status-tag--warning'
                : nextStep.tone === 'progress'
                  ? 'status-tag--ok'
                  : ''
            }`.trim()}
          >
            {nextStep.label}
          </span>
          <p className="admin-decision__note">{nextStep.detail}</p>
        </div>

        {drift === null ? null : <PerformanceDriftBlock drift={drift} />}

        <p className="admin-decision__note">
          최근 13주의 다음 주 예측 결과를 기준으로 산정한 성능입니다.
        </p>
        <p className="admin-decision__note">
          MAE는 실제 가격과 평균 몇 원/L 차이였는지, MAPE는 평균 몇 % 차이였는지를 뜻합니다.
        </p>
      </div>
    </SectionCard>
  );
}
