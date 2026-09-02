import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';
import type {
  ParameterSensitivity,
  ParameterSensitivityGroup,
  ParameterSensitivityGroupKey,
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
        {index + 1}. {GROUP_LABEL[candidate.groupKey].replace(' 민감도', '')} {candidate.label}
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

export function AdminParameterSensitivity({
  sensitivity,
}: {
  sensitivity: ParameterSensitivity | null;
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
          <p className="admin-decision__note">
            후보는 과거 백테스트 기반 탐색 결과입니다. 실제 적용 전 별도 Shadow 검증이 필요하며, 이 화면에서
            운영 모델이나 파라미터를 변경하지 않습니다.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
