import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';
import type { CandidatePersistence } from '@/lib/forecast/candidate-persistence';
import type {
  ParameterSensitivity,
  ParameterSensitivityGroup,
  ParameterSensitivityGroupKey,
  CombinationAnalysis,
  SensitivityCandidate,
  SensitivityWindowMetrics,
  TuningCandidate,
} from '@/lib/forecast/parameter-sensitivity';

const GROUP_LABEL: Record<ParameterSensitivityGroupKey, string> = {
  trendLookback: 'Trend lookback 민감도',
  dubai: 'Dubai 민감도',
  usdKrw: 'USD/KRW 민감도',
  cap: '외부 보정 Cap 민감도',
};

const TUNING_FLOW_STEPS = [
  '자동 비교',
  '후보 최대 3개',
  '1순위 2주 확인',
  'Shadow 검증',
  '새 실제 데이터 13주',
  '운영 적용 검토',
];

function TuningFlowGuide() {
  return (
    <div className="tuning-flow">
      <h3 className="tuning-flow__title">자동 튜닝 흐름</h3>
      <div className="tuning-flow__copy">
        <p>최신 데이터가 반영되면 여러 예측 설정을 자동 비교해 현재보다 나은 후보를 찾습니다.</p>
        <p>
          같은 후보가 새 주간 데이터에서 2주 연속 확인되면 Shadow에서 새 실제 데이터 13주로 검증하며,
          결과가 좋아도 자동 적용되지는 않습니다.
        </p>
      </div>
      <ol className="tuning-flow__steps">
        {TUNING_FLOW_STEPS.map((step) => (
          <li key={step}>
            <span className="tuning-flow__step">{step}</span>
          </li>
        ))}
      </ol>
      <p className="tuning-flow__note">검증 중인 후보는 중간에 변경하지 않습니다.</p>
    </div>
  );
}

function ShadowEntryStatus({ persistence }: { persistence: CandidatePersistence }) {
  if (persistence.candidateFingerprint === null) {
    return (
      <p className="admin-decision__note">
        {persistence.status === 'reset'
          ? '1순위 후보가 사라져 Shadow 진입 확인을 다시 시작합니다.'
          : '기준을 통과한 1순위 후보가 확인되면 Shadow 진입 확인을 시작합니다.'}
      </p>
    );
  }

  const confirmed = persistence.confirmedCount >= persistence.requiredCount;

  return (
    <div className="shadow-entry">
      <span className={`status-tag ${confirmed ? 'status-tag--ok' : ''}`.trim()}>
        {`Shadow 진입 확인 · ${persistence.confirmedCount}/${persistence.requiredCount}주${
          confirmed ? ' 완료' : ''
        }`}
      </span>
      <p className="admin-decision__note">
        {confirmed
          ? '같은 후보가 새 주간 데이터에서 2회 연속 확인되어 Shadow 검증을 시작할 수 있습니다.'
          : '같은 후보가 다음 새 주간 데이터에서도 기준을 통과하면 Shadow 검증을 시작합니다.'}
      </p>
      {persistence.status === 'reset' ? (
        <p className="admin-decision__note">최신 1순위 후보가 변경되어 확인을 다시 시작합니다.</p>
      ) : null}
    </div>
  );
}

function formatMae(value: number | null): string {
  return value === null ? '산정 전' : formatPriceText(value);
}

function formatMape(value: number | null): string {
  return value === null ? '산정 전' : `${value.toFixed(2)}%`;
}

function formatDirectionAccuracy(value: number | null): string {
  return value === null ? '산정 전' : `${(value * 100).toFixed(1)}%`;
}

function formatDelta(current: number | null, candidate: number | null, digits = 2): string {
  if (current === null || candidate === null) {
    return '';
  }

  const delta = candidate - current;

  if (Math.abs(delta) < 10 ** -digits / 2) {
    return ' (변화 없음)';
  }

  return ` (${delta > 0 ? '+' : ''}${delta.toFixed(digits)})`;
}

function CandidateRow({
  candidate,
  current,
}: {
  candidate: SensitivityCandidate;
  current: SensitivityWindowMetrics;
}) {
  return (
    <tr>
      <th scope="row" data-label="설정">
        {candidate.label}
        {candidate.isCurrent ? <span className="status-tag status-tag--ok">현재</span> : null}
      </th>
      <td data-label="13주 MAE">
        {formatMae(candidate.recentOneStep.maeKrwPerL)}
        {candidate.isCurrent ? '' : formatDelta(current.maeKrwPerL, candidate.recentOneStep.maeKrwPerL)}
      </td>
      <td data-label="13주 MAPE">
        {formatMape(candidate.recentOneStep.mapePct)}
        {candidate.isCurrent ? '' : formatDelta(current.mapePct, candidate.recentOneStep.mapePct)}
      </td>
      <td data-label="26주 MAE">{formatMae(candidate.longOneStep.maeKrwPerL)}</td>
      <td data-label="최대 오차">{formatMae(candidate.recentOneStep.maxAbsoluteErrorKrwPerL)}</td>
      <td data-label="방향 정확도">
        {formatDirectionAccuracy(candidate.recentOneStep.directionAccuracyRatio)}
      </td>
    </tr>
  );
}

function SensitivityGroup({
  group,
  current,
}: {
  group: ParameterSensitivityGroup;
  current: SensitivityWindowMetrics;
}) {
  return (
    <details className="admin-panel admin-disclosure">
      <summary className="admin-disclosure__summary">
        <strong>{GROUP_LABEL[group.key]}</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        {group.status === 'not-applicable' || group.candidates.length === 0 ? (
          <p className="backtest-detail__empty">
            {group.notApplicableReason ?? '평가할 후보가 없습니다.'}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table sensitivity-table">
              <thead>
                <tr>
                  <th scope="col">설정</th>
                  <th scope="col">13주 MAE</th>
                  <th scope="col">13주 MAPE</th>
                  <th scope="col">26주 MAE</th>
                  <th scope="col">최대 오차</th>
                  <th scope="col">방향 정확도</th>
                </tr>
              </thead>
              <tbody>
                {group.candidates.map((candidate) => (
                  <CandidateRow
                    key={`${group.key}-${candidate.label}`}
                    candidate={candidate}
                    current={current}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function TuningCandidateRow({
  candidate,
  index,
  sensitivity,
}: {
  candidate: TuningCandidate;
  index: number;
  sensitivity: ParameterSensitivity;
}) {
  return (
    <li className="sensitivity-candidate">
      <strong>
        {index + 1}. [{candidate.kind === 'combination' ? '2단계 조합' : '단일 설정'}]{' '}
        {candidate.kind === 'combination'
          ? candidate.label
          : `${GROUP_LABEL[candidate.groupKey].replace(' 민감도', '')} ${candidate.label}`}
      </strong>
      <span>
        13주 MAE {formatMae(sensitivity.currentRecentOneStep.maeKrwPerL)} →{' '}
        {formatMae(candidate.recentOneStep.maeKrwPerL)}
      </span>
      <span>
        26주 MAE {formatMae(sensitivity.currentLongOneStep.maeKrwPerL)} →{' '}
        {formatMae(candidate.longOneStep.maeKrwPerL)}
      </span>
      <span className="sensitivity-candidate__checks">기존 승격 품질 기준 충족</span>
    </li>
  );
}

function CombinationAnalysisPanel({ analysis }: { analysis: CombinationAnalysis | null }) {
  if (analysis === null || analysis.status === 'not-applicable') {
    return null;
  }

  if (analysis.status === 'insufficient-seeds' || analysis.candidates.length === 0) {
    return (
      <div className="admin-panel sensitivity-combination">
        <strong>2단계 조합 분석</strong>
        <p className="backtest-detail__empty">2단계 조합 후보가 없습니다.</p>
        <p className="admin-decision__note">
          1단계 비교에서 조합할 만큼 충분한 개선 후보가 확인되지 않았습니다.
        </p>
      </div>
    );
  }

  return (
    <details className="admin-panel admin-disclosure sensitivity-combination">
      <summary className="admin-disclosure__summary">
        <strong>2단계 조합 분석</strong>
        <span className="sensitivity-combination__count">
          {analysis.evaluatedCandidateCount}개 조합 평가
        </span>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <p className="admin-decision__note">
          1단계 비교에서 기준을 통과한 설정 중 서로 다른 항목의 상위 후보를 두 개씩 조합해 추가로
          비교합니다.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table sensitivity-table">
            <thead>
              <tr>
                <th scope="col">조합</th>
                <th scope="col">13주 MAE</th>
                <th scope="col">13주 MAPE</th>
                <th scope="col">26주 MAE</th>
                <th scope="col">최대 오차</th>
                <th scope="col">방향 정확도</th>
                <th scope="col">품질 기준</th>
              </tr>
            </thead>
            <tbody>
              {analysis.candidates.map((candidate) => (
                <tr key={candidate.label}>
                  <th scope="row">{candidate.label}</th>
                  <td data-label="13주 MAE">{formatMae(candidate.recentOneStep.maeKrwPerL)}</td>
                  <td data-label="13주 MAPE">{formatMape(candidate.recentOneStep.mapePct)}</td>
                  <td data-label="26주 MAE">{formatMae(candidate.longOneStep.maeKrwPerL)}</td>
                  <td data-label="최대 오차">
                    {formatMae(candidate.recentOneStep.maxAbsoluteErrorKrwPerL)}
                  </td>
                  <td data-label="방향 정확도">
                    {formatDirectionAccuracy(candidate.recentOneStep.directionAccuracyRatio)}
                  </td>
                  <td data-label="품질 기준">
                    <span
                      className={`status-tag ${candidate.meetsPromotionQuality ? 'status-tag--ok' : ''}`.trim()}
                    >
                      {candidate.meetsPromotionQuality ? '충족' : '미충족'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export function AdminParameterSensitivity({
  sensitivity,
  persistence = null,
}: {
  sensitivity: ParameterSensitivity | null;
  persistence?: CandidatePersistence | null;
}) {
  if (sensitivity === null) {
    return (
      <SectionCard
        title="파라미터 민감도 분석"
        badge="분석 없음"
        description="현재 예측 설정과 다른 설정을 비교해 더 나은 후보가 있는지 확인합니다. 결과는 참고용이며 자동으로 적용되지 않습니다."
        className="admin-sensitivity"
        emptyStateTitle="민감도 분석 데이터가 없습니다."
        emptyStateCopy="다음 예측 실행부터 설정별 성능 비교가 시작됩니다."
      />
    );
  }

  const { currentParams } = sensitivity;

  return (
    <SectionCard
      title="파라미터 민감도 분석"
      badge={
        sensitivity.tuningCandidates.length === 0
          ? '검토 후보 없음'
          : `검토 후보 ${sensitivity.tuningCandidates.length}건`
      }
      description="현재 예측 설정과 다른 설정을 비교해 더 나은 후보가 있는지 확인합니다. 결과는 참고용이며 자동으로 적용되지 않습니다."
      className="admin-sensitivity"
    >
      <div className="admin-detail-stack">
        <TuningFlowGuide />
        <div className="admin-metric-grid">
          {[
            ['현재 모델', `Model ${currentParams.modelId}`],
            ['Trend lookback', `${currentParams.trendLookbackWeeks}주`],
            [
              'Dubai',
              currentParams.dubai === null
                ? '미사용'
                : `lag ${currentParams.dubai.lagWeeks}주 · weight ${(currentParams.dubai.weight * 100).toFixed(1)}%`,
            ],
            [
              'USD/KRW',
              currentParams.usdKrw === null
                ? '미사용'
                : `lag ${currentParams.usdKrw.lagWeeks}주 · weight ${(currentParams.usdKrw.weight * 100).toFixed(1)}%`,
            ],
            ['외부 보정 Cap', `±${(currentParams.externalAdjustmentCapRatio * 100).toFixed(0)}%`],
          ].map(([label, value]) => (
            <div key={label} className="admin-metric">
              <span className="dashboard-shell__metric-label">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        {sensitivity.groups.map((group) => (
          <SensitivityGroup key={group.key} group={group} current={sensitivity.currentRecentOneStep} />
        ))}

        <CombinationAnalysisPanel analysis={sensitivity.combinationAnalysis} />

        <div className="admin-panel sensitivity-candidates">
          <strong>튜닝 검토 후보</strong>
          {!sensitivity.sampleSufficient ? (
            <p className="backtest-detail__empty">
              백테스트 표본이 충분하지 않아 튜닝 후보를 제안하지 않습니다.
            </p>
          ) : sensitivity.tuningCandidates.length === 0 ? (
            <p className="backtest-detail__empty">
              현재 테스트 범위에서 운영 설정보다 명확히 우수한 튜닝 후보가 없습니다.
            </p>
          ) : (
            <ol className="sensitivity-candidates__list">
              {sensitivity.tuningCandidates.map((candidate, index) => (
                <TuningCandidateRow
                  key={`${candidate.groupKey}-${candidate.label}`}
                  candidate={candidate}
                  index={index}
                  sensitivity={sensitivity}
                />
              ))}
            </ol>
          )}
          {persistence === null ? null : <ShadowEntryStatus persistence={persistence} />}
          <p className="admin-decision__note">
            후보는 과거 데이터 비교 결과입니다. 조합 후보도 실제 적용 전에 새 실제 데이터를 이용한 검증을
            거치며, 이 화면에서 운영 모델이나 파라미터를 변경하지 않습니다.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
