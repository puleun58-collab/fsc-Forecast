import type { ReactNode } from 'react';

import { AdminDisclosureToggle } from './admin-disclosure-toggle';

import {
  CANDIDATE_SWITCH_MIN_IMPROVEMENT_KRW_PER_L,
  CANDIDATE_SWITCH_MIN_IMPROVEMENT_RATIO,
} from '@/lib/forecast/candidate-switch';
import { CANDIDATE_PERSISTENCE_REQUIRED_COUNT } from '@/lib/forecast/candidate-persistence';
import {
  PROMOTION_MAX_ERROR_TOLERANCE_RATIO,
  PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT,
  PROMOTION_VOLATILITY_TOLERANCE_RATIO,
} from '@/lib/forecast/forecast-model-config';
import {
  evaluateShadowDegradation,
  SHADOW_DEGRADATION_ABSOLUTE_KRW_PER_L,
  SHADOW_DEGRADATION_RELATIVE_RATIO,
  SHADOW_DEGRADATION_REQUIRED_COUNT,
  SHADOW_MIN_OBSERVATION_COUNT,
} from '@/lib/forecast/shadow-degradation';
import {
  SHADOW_REQUIRED_SAMPLE_COUNT,
  summarizeShadowValidation,
  type ShadowValidationSession,
} from '@/lib/forecast/shadow-validation';

function formatRatioPercent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}

function Criterion({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-tuning-criteria__criterion">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        <span>{children}</span>
      </dd>
    </div>
  );
}

type ShadowContext = {
  label: string;
  progress: string | null;
  detail: string;
};

function describeShadowContext(session: ShadowValidationSession | null): ShadowContext | null {
  if (session === null) {
    return null;
  }

  const summary = summarizeShadowValidation(session);
  const degradation = evaluateShadowDegradation(session);
  const label =
    summary.status === 'validating' ? '현재 Shadow 검증 진행 중' : 'Shadow 검증 완료';
  const progress = `${summary.completedSampleCount}/${summary.requiredSampleCount}주`;

  if (
    degradation?.status === 'watch' ||
    degradation?.status === 'stop-recommended'
  ) {
    return {
      label,
      progress,
      detail: `현재 중단 기준 확인 중 ${degradation.confirmedCount}/${degradation.requiredCount}주. 중단 권고가 표시되어도 자동으로 Shadow를 종료하지 않습니다.`,
    };
  }

  if (summary.status === 'validating') {
    return {
      label,
      progress,
      detail: `Shadow 검증은 ${summary.requiredSampleCount}주 완료 후 최종 통과 여부를 판단합니다.`,
    };
  }

  if (summary.status === 'reviewable') {
    return {
      label,
      progress,
      detail: '운영 전환 검토가 가능한 상태이며 운영 모델은 아직 변경되지 않았습니다.',
    };
  }

  if (summary.status === 'failed') {
    return {
      label,
      progress,
      detail: '운영 전환 검토 기준을 통과하지 못했습니다.',
    };
  }

  return {
    label: '현재 Shadow 검증 중단',
    progress: null,
    detail: '최종 중단 여부와 다음 조치는 관리자가 판단합니다.',
  };
}

export function AdminTuningCriteria({ session }: { session: ShadowValidationSession | null }) {
  const shadowContext = describeShadowContext(session);
  const candidateSwitchThreshold = `${formatRatioPercent(
    CANDIDATE_SWITCH_MIN_IMPROVEMENT_RATIO,
  )} + ${CANDIDATE_SWITCH_MIN_IMPROVEMENT_KRW_PER_L}원/L`;
  const promotionAccuracyThreshold = `MAE ${formatRatioPercent(
    PROMOTION_MIN_MAE_IMPROVEMENT_RATIO,
  )} 또는 MAPE ${PROMOTION_MIN_MAPE_IMPROVEMENT_PCT_POINT}%p`;
  const degradationThreshold = `${formatRatioPercent(
    SHADOW_DEGRADATION_RELATIVE_RATIO,
  )} + ${SHADOW_DEGRADATION_ABSOLUTE_KRW_PER_L}원/L`;

  return (
    <details className="admin-panel admin-disclosure admin-tuning-criteria">
      <summary className="admin-disclosure__summary admin-tuning-criteria__summary">
        <span className="admin-tuning-criteria__summary-copy">
          <strong>튜닝·Shadow 운영 기준</strong>
          <span>{`후보 ${CANDIDATE_PERSISTENCE_REQUIRED_COUNT}주 확인 → Shadow ${SHADOW_REQUIRED_SAMPLE_COUNT}주 검증 → 기준 통과 시 운영 전환 검토`}</span>
        </span>
        <AdminDisclosureToggle />
      </summary>

      <div className="admin-disclosure__body admin-tuning-criteria__body">
        {shadowContext === null ? null : (
          <div className="admin-tuning-criteria__context">
            <span className="admin-tuning-criteria__context-status">
              {shadowContext.label}
              {shadowContext.progress === null ? null : (
                <strong className="admin-tuning-criteria__context-progress">
                  {shadowContext.progress}
                </strong>
              )}
            </span>
            <span className="admin-tuning-criteria__context-detail">{shadowContext.detail}</span>
          </div>
        )}

        <div className="admin-tuning-criteria__groups">
          <section className="admin-tuning-criteria__group" aria-labelledby="tuning-candidate-criteria">
            <header>
              <span className="admin-tuning-criteria__index" aria-hidden="true">
                01
              </span>
              <h3 id="tuning-candidate-criteria">튜닝 검토 후보 기준</h3>
            </header>
            <p className="admin-tuning-criteria__lead">
              현재 운영 모델보다 충분히 좋아진 후보만 검토합니다.
            </p>
            <dl className="admin-tuning-criteria__facts">
              <Criterion label="후보 교체" value={candidateSwitchThreshold}>
                최근 13주 MAE가 현재 확인 중인 후보보다 상대 5% 이상, 동시에 절대 0.5원/L 이상
                개선된 경우에만 교체합니다.
              </Criterion>
              <Criterion label="연속 확인" value={`${CANDIDATE_PERSISTENCE_REQUIRED_COUNT}주`}>
                같은 후보가 새 주간 Actual 기준 2주 연속 유지되면 Shadow 검증 대상으로 전환합니다.
                같은 주차 재실행은 횟수에 포함하지 않습니다.
              </Criterion>
            </dl>
            <p className="admin-tuning-criteria__note">
              작은 성능 차이만으로 후보가 자주 바뀌는 것을 막기 위한 기준입니다.
            </p>
          </section>

          <section className="admin-tuning-criteria__group" aria-labelledby="shadow-pass-criteria">
            <header>
              <span className="admin-tuning-criteria__index" aria-hidden="true">
                02
              </span>
              <h3 id="shadow-pass-criteria">Shadow 검증 통과 기준</h3>
            </header>
            <p className="admin-tuning-criteria__lead">
              Shadow에서는 후보 모델을 실제 운영 모델과 동시에 실행해 새 Actual{' '}
              {SHADOW_REQUIRED_SAMPLE_COUNT}주 동안 비교합니다. 다음 조건을 모두 만족해야 운영 전환
              검토가 가능합니다.
            </p>
            <dl className="admin-tuning-criteria__facts admin-tuning-criteria__facts--pass">
              <Criterion label="Shadow 검증" value={`${SHADOW_REQUIRED_SAMPLE_COUNT}주`}>
                새 Actual을 기준으로 운영 모델과 후보 모델을 같은 기간 비교합니다.
              </Criterion>
              <Criterion label="정확도 개선" value={promotionAccuracyThreshold}>
                MAE 상대 개선 또는 MAPE 절대 개선 중 하나를 충족해야 합니다.
              </Criterion>
              <Criterion
                label="최대 오차"
                value={`${Number((PROMOTION_MAX_ERROR_TOLERANCE_RATIO * 100).toFixed(0))}% 이내`}
              >
                후보가 가장 크게 틀린 오차를 운영 모델 최대 오차의 110% 이내로 제한해 한 번 크게
                빗나가는 후보를 제외합니다.
              </Criterion>
              <Criterion
                label="Forecast 변화폭"
                value={`운영 모델의 ${PROMOTION_VOLATILITY_TOLERANCE_RATIO}배 이내`}
              >
                <span className="admin-tuning-criteria__explanation">
                  지난주와 이번 주의 Forecast 변화폭을 비교합니다.
                </span>
                <span className="admin-tuning-criteria__explanation">
                  후보가 운영 모델의 2배를 넘으면 불안정한 예측으로 판단합니다.
                </span>
                <span className="admin-tuning-criteria__example">
                  <b>예시</b> 운영 모델이 평균 10원/L이면 후보는 20원/L 이내여야 합니다.
                </span>
                <span className="admin-tuning-criteria__clarifier">
                  ※{' '}
                  <b className="admin-tuning-criteria__clarifier-emphasis">
                    실제 유가 변동폭이 아니라
                  </b>
                  , 매주 새로 산출되는 Forecast 값 자체의 변화폭을 비교합니다.
                </span>
              </Criterion>
            </dl>
          </section>

          <section className="admin-tuning-criteria__group" aria-labelledby="shadow-stop-criteria">
            <header>
              <span className="admin-tuning-criteria__index" aria-hidden="true">
                03
              </span>
              <h3 id="shadow-stop-criteria">Shadow 중단 기준</h3>
            </header>
            <p className="admin-tuning-criteria__lead">
              Shadow 진행 중 후보 성능이 명확하게 나빠지는 경우 중단 검토가 필요합니다.
            </p>
            <dl className="admin-tuning-criteria__facts">
              <Criterion label="중단 판단 시작" value={`${SHADOW_MIN_OBSERVATION_COUNT}주`}>
                새 Actual 4주 이상 확보한 뒤부터 누적 성능 악화 여부를 판단합니다.
              </Criterion>
              <Criterion label="악화 기준" value={degradationThreshold}>
                후보 누적 MAE가 운영 모델보다 상대 20% 이상 나쁘고, 동시에 절대 5원/L 이상 나쁜
                경우입니다.
              </Criterion>
              <Criterion label="연속 악화" value={`${SHADOW_DEGRADATION_REQUIRED_COUNT}주`}>
                위 악화 상태가 2주 연속 확인되면 중단 권고를 표시합니다.
              </Criterion>
            </dl>
            <p className="admin-tuning-criteria__note admin-tuning-criteria__note--warning">
              중단 권고가 표시되어도 자동으로 Shadow를 종료하지 않습니다. 최종 중단 여부는 관리자가
              판단합니다.
            </p>
          </section>
        </div>
      </div>
    </details>
  );
}
