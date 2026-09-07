import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import type { CandidatePersistence } from '@/lib/forecast/candidate-persistence';
import { describeBiasCorrection } from '@/lib/forecast/bias-correction';
import {
  describeModelParamChanges,
  diffModelParams,
  formatModelParams,
  formatModelParamsRest,
  listModelParamFields,
} from '@/lib/forecast/describe-model-params';
import { describeDailySignal } from '@/lib/forecast/daily-signal';
import type {
  CandidateRegimeComparison,
  CandidateRegimeVerdict,
} from '@/lib/forecast/candidate-regime-comparison';
import type { MarketRegime } from '@/lib/forecast/market-regime';
import { describeTuningCandidateDecision } from '@/lib/forecast/candidate-decision';
import type {
  CandidateDecision,
  CandidateDecisionReason,
} from '@/lib/forecast/candidate-decision';
import type { PromotionQualityChecks } from '@/lib/forecast/promotion-quality';
import {
  describeIndicator,
  serializeSensitivityParamsKey,
  type DailySignalDiagnostics,
  type ParameterSensitivity,
  type ParameterSensitivityGroup,
  type ParameterSensitivityGroupKey,
  type CombinationAnalysis,
  type SensitivityCandidate,
  type SensitivityWindowMetrics,
  type TuningCandidate,
} from '@/lib/forecast/parameter-sensitivity';

const GROUP_LABEL: Record<ParameterSensitivityGroupKey, string> = {
  trendLookback: '추세 기간 민감도',
  dubai: 'Dubai 민감도',
  usdKrw: 'USD/KRW 민감도',
  cap: '외부 보정 상한 민감도',
  bias: '편향 보정 민감도',
  dailySignal: '일별 단기 신호 민감도',
};

const TUNING_FLOW_STEPS = [
  '자동 비교',
  '후보 최대 3개',
  '1순위 후보 연속 확인 2주',
  'Shadow 검증 · 새 실제 데이터 13주',
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

function ShadowEntryStatus({
  persistence,
  shadowActive,
}: {
  persistence: CandidatePersistence;
  shadowActive: boolean;
}) {
  if (persistence.candidateFingerprint === null) {
    return (
      <p className="admin-decision__note">
        {persistence.status === 'reset'
          ? '1순위 후보가 사라져 연속 확인을 다시 시작합니다.'
          : shadowActive
            ? '기준을 통과한 후보가 확인되면 차기 Shadow 후보로 추적합니다.'
            : '기준을 통과한 1순위 후보가 확인되면 연속 확인을 시작합니다.'}
      </p>
    );
  }

  const confirmed = persistence.confirmedCount >= persistence.requiredCount;
  const progress = `${persistence.confirmedCount}/${persistence.requiredCount}주`;
  const label = shadowActive
    ? confirmed
      ? `차기 Shadow 후보 확정 · 연속 확인 완료 ${progress}`
      : `차기 Shadow 후보 확인 · ${progress}`
    : `1순위 후보 연속 확인 · ${progress}${confirmed ? ' 완료' : ''}`;

  return (
    <div className="shadow-entry">
      <span className={`status-tag ${confirmed ? 'status-tag--ok' : ''}`.trim()}>{label}</span>
      <p className="admin-decision__note">
        {shadowActive
          ? confirmed
            ? '현재 Shadow 검증 완료 또는 중단 후 최신 기준으로 다시 확인합니다. 두 번째 Shadow를 동시에 시작하지 않습니다.'
            : '현재 Shadow 검증과 별도로 차기 후보의 연속 성능을 확인합니다.'
          : confirmed
            ? '같은 후보가 2주 연속 기준을 충족해 Shadow 검증 조건을 확보했습니다.'
            : '같은 후보가 다음 주에도 1순위를 유지하면 Shadow 검증을 시작합니다.'}
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

/** 상태 자체는 판단 기준이 아니라 참고용이라 방향과 크기만 짧게 보여준다. */
function describeDailyTrend(trendRatio: number | null): string {
  if (trendRatio === null) {
    return '표본 부족';
  }

  const percent = trendRatio * 100;

  if (Math.abs(percent) < 0.05) {
    return '보합';
  }

  return `${percent > 0 ? '상승' : '하락'} ${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

/** UI에 보이는 자리수로 반올림해 비교한다. 화면에서 같아 보이는 값은 같은 최저값으로 본다. */
function roundForDisplay(value: number | null, digits: number): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;
}

function bestOf(
  values: readonly (number | null)[],
  digits: number,
  mode: 'min' | 'max',
): number | null {
  const rounded = values
    .map((value) => roundForDisplay(value, digits))
    .filter((value): value is number => value !== null);

  if (rounded.length === 0) {
    return null;
  }

  return mode === 'min' ? Math.min(...rounded) : Math.max(...rounded);
}

interface GroupBestValues {
  recentMae: number | null;
  recentMape: number | null;
  longMae: number | null;
  maxError: number | null;
  directionAccuracy: number | null;
}

/** 최저/최고는 언제나 같은 그룹 안에서만 계산한다. */
function findGroupBestValues(candidates: readonly SensitivityCandidate[]): GroupBestValues {
  return {
    recentMae: bestOf(candidates.map((candidate) => candidate.recentOneStep.maeKrwPerL), 2, 'min'),
    recentMape: bestOf(candidates.map((candidate) => candidate.recentOneStep.mapePct), 2, 'min'),
    longMae: bestOf(candidates.map((candidate) => candidate.longOneStep.maeKrwPerL), 2, 'min'),
    maxError: bestOf(
      candidates.map((candidate) => candidate.recentOneStep.maxAbsoluteErrorKrwPerL),
      2,
      'min',
    ),
    directionAccuracy: bestOf(
      candidates.map((candidate) => candidate.recentOneStep.directionAccuracyRatio),
      3,
      'max',
    ),
  };
}

function BestFlag({
  value,
  best,
  digits,
  label,
}: {
  value: number | null;
  best: number | null;
  digits: number;
  label: '최저' | '최고';
}) {
  if (best === null || roundForDisplay(value, digits) !== best) {
    return null;
  }

  return <span className="status-tag admin-table__flag sensitivity-flag">{label}</span>;
}

const DECISION_REASON_LABEL: Record<CandidateDecisionReason, string> = {
  'minimum-improvement': '최근 성능 개선폭 부족',
  'long-mae': '26주 MAE 기준 초과',
  'max-error': '최대 오차 기준 초과',
  churn: '예측 변동성 기준 초과',
  'insufficient-sample': '최근 13주 표본 부족',
};

const DECISION_CHECK_LABEL: Record<Exclude<CandidateDecisionReason, 'insufficient-sample'>, string> = {
  'minimum-improvement': '최근 성능 개선',
  'long-mae': '26주 안정성',
  'max-error': '최대 오차',
  churn: '예측 변동성',
};

const DECISION_CHECK_ORDER = [
  'minimum-improvement',
  'long-mae',
  'max-error',
  'churn',
] as const;

function describeImprovement(decision: CandidateDecision, checks: PromotionQualityChecks): string {
  if (decision.improvementBasis === 'mae' && checks.maeImprovementRatio !== null) {
    return `MAE 개선 기준 통과 · 최근 MAE ${(checks.maeImprovementRatio * 100).toFixed(1)}% 개선`;
  }

  if (decision.improvementBasis === 'mape' && checks.mapeImprovementPctPoint !== null) {
    return `MAPE 개선 기준 통과 · 최근 MAPE ${checks.mapeImprovementPctPoint.toFixed(2)}%p 개선`;
  }

  return '최소 개선 기준을 넘지 못했습니다.';
}

function describeDecisionSummary(decision: CandidateDecision): string {
  switch (decision.status) {
    case 'current':
      return '현재';
    case 'top':
      return '1순위 후보';
    case 'eligible':
      return decision.rank === null ? '후보 통과' : `후보 통과 · 현재 ${decision.rank}순위`;
    case 'not-evaluable':
      return '평가 불가 · 최근 13주 표본 부족';
    case 'rejected':
      return decision.reasons.length === 1
        ? `후보 제외 · ${DECISION_REASON_LABEL[decision.reasons[0]]}`
        : `후보 제외 · ${decision.reasons.length}개 기준 미충족`;
  }
}

/** 판정 문구는 저장된 qualityChecks를 옮겨 적을 뿐, 기준을 다시 계산하지 않는다. */
function CandidateDecisionCell({
  decision,
  qualityChecks,
}: {
  decision: CandidateDecision;
  qualityChecks: PromotionQualityChecks | null;
}) {
  const summary = describeDecisionSummary(decision);

  if (decision.status === 'current' || qualityChecks === null) {
    return <span className="candidate-decision__summary">{summary}</span>;
  }

  return (
    <details className="admin-disclosure admin-disclosure--inline candidate-decision">
      <summary className="admin-disclosure__summary">
        <span className="candidate-decision__summary">{summary}</span>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <ul className="candidate-decision__checks">
          {DECISION_CHECK_ORDER.map((key) => (
            <li key={key}>
              <span>{DECISION_CHECK_LABEL[key]}</span>
              <strong>{decision.reasons.includes(key) ? '미통과' : '통과'}</strong>
            </li>
          ))}
        </ul>
        <p className="admin-decision__note">{describeImprovement(decision, qualityChecks)}</p>
      </div>
    </details>
  );
}

function CandidateRow({
  candidate,
  current,
  best,
  rank,
}: {
  candidate: SensitivityCandidate;
  current: SensitivityWindowMetrics;
  best: GroupBestValues;
  rank: number | null;
}) {
  const decision = describeTuningCandidateDecision({
    isCurrent: candidate.isCurrent,
    qualityChecks: candidate.qualityChecks,
    sampleCount: candidate.recentOneStep.sampleCount,
    rank,
  });

  return (
    <tr>
      <th scope="row" data-label="설정">
        <span className="admin-table__inline">
          {candidate.label}
          {candidate.isCurrent ? <span className="status-tag status-tag--ok admin-table__flag">현재</span> : null}
          {decision.status === 'top' ? (
            <span className="status-tag status-tag--accent admin-table__flag">1순위 후보</span>
          ) : null}
        </span>
      </th>
      <td data-label="13주 MAE">
        <span className="admin-table__inline">
          {formatMae(candidate.recentOneStep.maeKrwPerL)}
          {candidate.isCurrent ? '' : formatDelta(current.maeKrwPerL, candidate.recentOneStep.maeKrwPerL)}
          <BestFlag value={candidate.recentOneStep.maeKrwPerL} best={best.recentMae} digits={2} label="최저" />
        </span>
      </td>
      <td data-label="13주 MAPE">
        <span className="admin-table__inline">
          {formatMape(candidate.recentOneStep.mapePct)}
          {candidate.isCurrent ? '' : formatDelta(current.mapePct, candidate.recentOneStep.mapePct)}
          <BestFlag value={candidate.recentOneStep.mapePct} best={best.recentMape} digits={2} label="최저" />
        </span>
      </td>
      <td data-label="26주 MAE">
        <span className="admin-table__inline">
          {formatMae(candidate.longOneStep.maeKrwPerL)}
          <BestFlag value={candidate.longOneStep.maeKrwPerL} best={best.longMae} digits={2} label="최저" />
        </span>
      </td>
      <td data-label="최대 오차">
        <span className="admin-table__inline">
          {formatMae(candidate.recentOneStep.maxAbsoluteErrorKrwPerL)}
          <BestFlag
            value={candidate.recentOneStep.maxAbsoluteErrorKrwPerL}
            best={best.maxError}
            digits={2}
            label="최저"
          />
        </span>
      </td>
      <td data-label="방향 정확도">
        <span className="admin-table__inline">
          {formatDirectionAccuracy(candidate.recentOneStep.directionAccuracyRatio)}
          <BestFlag
            value={candidate.recentOneStep.directionAccuracyRatio}
            best={best.directionAccuracy}
            digits={3}
            label="최고"
          />
        </span>
      </td>
      <td data-label="판정">
        <CandidateDecisionCell decision={decision} qualityChecks={candidate.qualityChecks} />
      </td>
    </tr>
  );
}

function DailySignalFacts({ diagnostics }: { diagnostics: DailySignalDiagnostics }) {
  return (
    <p className="admin-decision__note">
      최근 단기 방향 · {describeDailyTrend(diagnostics.trendRatio)}
      {diagnostics.startDate === null || diagnostics.endDate === null
        ? ''
        : ` · ${formatDashboardDate(diagnostics.startDate)}~${formatDashboardDate(diagnostics.endDate)}`}
      {diagnostics.firstPriceKrwPerL === null || diagnostics.latestPriceKrwPerL === null
        ? ''
        : ` · ${formatPriceText(diagnostics.firstPriceKrwPerL)} → ${formatPriceText(diagnostics.latestPriceKrwPerL)}`}
      {` · 관측 ${diagnostics.observationCount}개`}
    </p>
  );
}

function SensitivityGroup({
  group,
  current,
  rankByParamsKey,
  dailySignal,
}: {
  group: ParameterSensitivityGroup;
  current: SensitivityWindowMetrics;
  rankByParamsKey: ReadonlyMap<string, number>;
  dailySignal: DailySignalDiagnostics | null;
}) {
  const best = findGroupBestValues(group.candidates);

  return (
    <details className="admin-panel admin-disclosure">
      <summary className="admin-disclosure__summary">
        <strong>{GROUP_LABEL[group.key]}</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        {group.key === 'dailySignal' && dailySignal !== null ? (
          <DailySignalFacts diagnostics={dailySignal} />
        ) : null}
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
                  <th scope="col">판정</th>
                </tr>
              </thead>
              <tbody>
                {group.candidates.map((candidate) => (
                  <CandidateRow
                    key={`${group.key}-${candidate.label}`}
                    candidate={candidate}
                    current={current}
                    best={best}
                    rank={rankByParamsKey.get(serializeSensitivityParamsKey(candidate.params)) ?? null}
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

const REGIME_LABEL: Record<MarketRegime, string> = {
  stable: '안정',
  rising: '상승 추세',
  falling: '하락 추세',
  'high-volatility': '고변동',
  unclassified: '분류 전',
};

const VERDICT_LABEL: Record<CandidateRegimeVerdict, string> = {
  improved: '개선',
  similar: '유사',
  worsened: '악화',
  'insufficient-sample': '표본 부족',
};

function CandidateRegimePanel({ comparison }: { comparison: CandidateRegimeComparison }) {
  return (
    <details className="admin-disclosure admin-disclosure--inline candidate-regime">
      <summary className="admin-disclosure__summary">
        <strong>시장 국면별 성능 보기</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <ul className="candidate-regime__badges">
          {comparison.regimes.map((row) => (
            <li key={row.regime}>
              <span className="status-tag">
                {REGIME_LABEL[row.regime]} {VERDICT_LABEL[row.verdict]}
              </span>
            </li>
          ))}
        </ul>
        <div className="admin-table-wrap">
          <table className="admin-table candidate-regime-table">
            <caption className="admin-table__caption">
              최근 {comparison.windowWeeks}주 중 현재 설정과 동일한 평가 주차 {comparison.comparedSampleCount}주
              기준
            </caption>
            <thead>
              <tr>
                <th scope="col">국면</th>
                <th scope="col">표본</th>
                <th scope="col">현재 MAE</th>
                <th scope="col">후보 MAE</th>
                <th scope="col">MAE 차이</th>
                <th scope="col">현재 MAPE</th>
                <th scope="col">후보 MAPE</th>
                <th scope="col">방향 적중률</th>
                <th scope="col">판정</th>
              </tr>
            </thead>
            <tbody>
              {comparison.regimes.map((row) => (
                <tr key={row.regime}>
                  <th scope="row" data-label="국면">
                    {REGIME_LABEL[row.regime]}
                  </th>
                  <td data-label="표본">{row.sampleCount}주</td>
                  <td data-label="현재 MAE">{formatMae(row.currentMaeKrwPerL)}</td>
                  <td data-label="후보 MAE">{formatMae(row.candidateMaeKrwPerL)}</td>
                  <td data-label="MAE 차이">
                    {row.maeDeltaKrwPerL === null
                      ? '산정 전'
                      : `${row.maeDeltaKrwPerL > 0 ? '+' : ''}${formatMae(row.maeDeltaKrwPerL)}`}
                  </td>
                  <td data-label="현재 MAPE">{formatMape(row.currentMapePct)}</td>
                  <td data-label="후보 MAPE">{formatMape(row.candidateMapePct)}</td>
                  <td data-label="방향 적중률">
                    {formatDirectionAccuracy(row.currentDirectionAccuracyRatio)} →{' '}
                    {formatDirectionAccuracy(row.candidateDirectionAccuracyRatio)}
                  </td>
                  <td data-label="판정">{VERDICT_LABEL[row.verdict]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {comparison.weakestRegime === null ? null : (
          <p className="admin-decision__note">
            주의 · {REGIME_LABEL[comparison.weakestRegime]} 구간에서 현재 설정보다 오차가 큽니다.
          </p>
        )}
        <p className="admin-decision__note">
          시장 국면별 비교는 후보의 취약 구간을 확인하기 위한 참고 분석이며, 현재 후보 선정 또는 Shadow
          진입 조건에는 사용되지 않습니다.
        </p>
      </div>
    </details>
  );
}

function describeSelectionReason(
  index: number,
  candidate: TuningCandidate,
  topCandidate: TuningCandidate,
): string {
  if (index === 0) {
    return '최근 13주 MAE가 후보 중 가장 낮습니다.';
  }

  const gap =
    candidate.recentOneStep.maeKrwPerL === null || topCandidate.recentOneStep.maeKrwPerL === null
      ? null
      : candidate.recentOneStep.maeKrwPerL - topCandidate.recentOneStep.maeKrwPerL;

  return gap === null
    ? '최근 13주 MAE를 산정하지 못했습니다.'
    : `1순위 대비 최근 13주 MAE ${formatPriceText(Math.abs(gap))} ${gap >= 0 ? '높습니다' : '낮지만 순위 기준에서 밀렸습니다'}.`;
}

function TuningCandidateRow({
  candidate,
  index,
  sensitivity,
  comparison,
  topCandidate,
}: {
  candidate: TuningCandidate;
  index: number;
  sensitivity: ParameterSensitivity;
  comparison: CandidateRegimeComparison | null;
  topCandidate: TuningCandidate;
}) {
  const changes = diffModelParams(sensitivity.currentParams, candidate.params);
  const isTop = index === 0;

  return (
    <li className={`sensitivity-candidate${isTop ? ' sensitivity-candidate--top' : ''}`}>
      <div className="sensitivity-candidate__head">
        <strong className="sensitivity-candidate__rank">
          {isTop ? '1순위 후보' : `${index + 1}순위 후보`}
        </strong>
        <span className="sensitivity-candidate__meta">
          <span className="status-tag status-tag--ok admin-table__flag">
            {candidate.meetsPromotionQuality ? '기준 통과' : '기준 미충족'}
          </span>
          <span className="sensitivity-candidate__kind">
            {candidate.kind === 'combination' ? '조합 후보' : '단일 설정'}
          </span>
        </span>
      </div>
      <strong className="sensitivity-candidate__title">
        {formatModelParams(candidate.params, { compact: true })}
      </strong>
      <div className="sensitivity-candidate__metrics">
        <div className="sensitivity-candidate__metric sensitivity-candidate__metric--primary">
          <span className="dashboard-shell__metric-label">최근 13주 MAE</span>
          <strong>
            {formatMae(sensitivity.currentRecentOneStep.maeKrwPerL)} →{' '}
            <span className="sensitivity-candidate__mae-after">
              {formatMae(candidate.recentOneStep.maeKrwPerL)}
            </span>
          </strong>
        </div>
        <div className="sensitivity-candidate__metric">
          <span className="dashboard-shell__metric-label">최근 26주 MAE</span>
          <strong>
            {formatMae(sensitivity.currentLongOneStep.maeKrwPerL)} →{' '}
            {formatMae(candidate.longOneStep.maeKrwPerL)}
          </strong>
        </div>
      </div>
      <p className="sensitivity-candidate__reason">
        선정 이유 · {describeSelectionReason(index, candidate, topCandidate)}
      </p>
      {changes.length === 0 ? null : (
        <p className="sensitivity-candidate__change">변경 · {describeModelParamChanges(changes)}</p>
      )}
      {comparison === null ? null : <CandidateRegimePanel comparison={comparison} />}
    </li>
  );
}

function CombinationAnalysisPanel({
  analysis,
  rankByParamsKey,
}: {
  analysis: CombinationAnalysis | null;
  rankByParamsKey: ReadonlyMap<string, number>;
}) {
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
                <th scope="col">판정</th>
              </tr>
            </thead>
            <tbody>
              {analysis.candidates.map((candidate) => {
                const rank = rankByParamsKey.get(serializeSensitivityParamsKey(candidate.params)) ?? null;
                const decision = describeTuningCandidateDecision({
                  isCurrent: false,
                  qualityChecks: candidate.qualityChecks,
                  sampleCount: candidate.recentOneStep.sampleCount,
                  rank,
                });

                return (
                  <tr key={candidate.label}>
                    <th scope="row" data-label="조합">
                      <span className="admin-table__inline">
                        {candidate.label}
                        {decision.status === 'top' ? (
                          <span className="status-tag status-tag--accent admin-table__flag">1순위 후보</span>
                        ) : null}
                      </span>
                    </th>
                    <td data-label="13주 MAE">{formatMae(candidate.recentOneStep.maeKrwPerL)}</td>
                    <td data-label="13주 MAPE">{formatMape(candidate.recentOneStep.mapePct)}</td>
                    <td data-label="26주 MAE">{formatMae(candidate.longOneStep.maeKrwPerL)}</td>
                    <td data-label="최대 오차">
                      {formatMae(candidate.recentOneStep.maxAbsoluteErrorKrwPerL)}
                    </td>
                    <td data-label="방향 정확도">
                      {formatDirectionAccuracy(candidate.recentOneStep.directionAccuracyRatio)}
                    </td>
                    <td data-label="판정">
                      <CandidateDecisionCell decision={decision} qualityChecks={candidate.qualityChecks} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function describeCandidateName(candidate: TuningCandidate): string {
  return formatModelParams(candidate.params, { compact: true });
}

/** 수치가 가장 낮은 후보가 아니라 실제 ranking 1위 후보만 요약한다. */
function TopCandidateSummary({
  sensitivity,
  candidate,
  stageLabel,
}: {
  sensitivity: ParameterSensitivity;
  candidate: TuningCandidate | null;
  stageLabel: string | null;
}) {
  if (candidate === null) {
    return (
      <p className="backtest-detail__empty">현재 기준을 통과한 튜닝 후보가 없습니다.</p>
    );
  }

  const { maeImprovementRatio, mapeImprovementPctPoint } = candidate.qualityChecks;

  return (
    <div className="admin-panel top-candidate">
      <div className="top-candidate__head">
        <span className="status-tag status-tag--accent">이번 주 1순위 후보</span>
        <strong>{describeCandidateName(candidate)}</strong>
        <span className="status-tag status-tag--ok">품질 기준 통과</span>
      </div>
      <p className="top-candidate__params">{formatModelParamsRest(candidate.params)}</p>
      {describeModelParamChanges(diffModelParams(sensitivity.currentParams, candidate.params)) === null ? null : (
        <p className="top-candidate__change">
          변경 · {describeModelParamChanges(diffModelParams(sensitivity.currentParams, candidate.params))}
        </p>
      )}
      <div className="admin-metric-grid">
        <div className="admin-metric">
          <span className="dashboard-shell__metric-label">최근 13주 MAE</span>
          <strong>
            {formatMae(sensitivity.currentRecentOneStep.maeKrwPerL)} →{' '}
            {formatMae(candidate.recentOneStep.maeKrwPerL)}
          </strong>
          <span className="top-candidate__delta">
            {maeImprovementRatio === null
              ? '개선율 산정 전'
              : `${(maeImprovementRatio * 100).toFixed(1)}% 개선`}
          </span>
        </div>
        <div className="admin-metric">
          <span className="dashboard-shell__metric-label">최근 13주 MAPE</span>
          <strong>
            {formatMape(sensitivity.currentRecentOneStep.mapePct)} →{' '}
            {formatMape(candidate.recentOneStep.mapePct)}
          </strong>
          <span className="top-candidate__delta">
            {mapeImprovementPctPoint === null
              ? '개선폭 산정 전'
              : `${mapeImprovementPctPoint.toFixed(2)}%p 개선`}
          </span>
        </div>
        <div className="admin-metric">
          <span className="dashboard-shell__metric-label">최근 26주 MAE</span>
          <strong>
            {formatMae(sensitivity.currentLongOneStep.maeKrwPerL)} →{' '}
            {formatMae(candidate.longOneStep.maeKrwPerL)}
          </strong>
        </div>
        <div className="admin-metric">
          <span className="dashboard-shell__metric-label">검증 상태</span>
          <strong>{stageLabel ?? '검증 시작 전'}</strong>
        </div>
      </div>
    </div>
  );
}

export function AdminParameterSensitivity({
  sensitivity,
  persistence = null,
  regimeComparisons = [],
  stageLabel = null,
  shadowActive = false,
}: {
  sensitivity: ParameterSensitivity | null;
  persistence?: CandidatePersistence | null;
  regimeComparisons?: readonly CandidateRegimeComparison[];
  /** 운영 요약 카드와 같은 진행 단계 문구를 재사용한다. */
  stageLabel?: string | null;
  /** Shadow가 검증 중이면 연속 확인은 차기 Shadow 후보 추적으로 표시한다. */
  shadowActive?: boolean;
}) {
  if (sensitivity === null) {
    return (
      <SectionCard
        title="파라미터 민감도 분석"
        badge="분석 없음"
        description="예측 정확도를 높이기 위해 주요 설정과 보조 신호의 효과를 비교합니다. 결과는 참고용이며 자동으로 적용되지 않습니다."
        className="admin-sensitivity"
        emptyStateTitle="민감도 분석 데이터가 없습니다."
        emptyStateCopy="다음 예측 실행부터 설정별 성능 비교가 시작됩니다."
      />
    );
  }

  const { currentParams } = sensitivity;
  // 1순위 후보는 수치상 최저값이 아니라 튜닝 ranking 1위와 정확히 일치하는 후보만 가리킨다.
  const topCandidate = sensitivity.tuningCandidates[0] ?? null;
  const rankByParamsKey = new Map(
    sensitivity.tuningCandidates.map((candidate, index) => [
      serializeSensitivityParamsKey(candidate.params),
      index + 1,
    ]),
  );

  return (
    <SectionCard
      title="파라미터 민감도 분석"
      badge={
        sensitivity.tuningCandidates.length === 0
          ? '검토 후보 없음'
          : `검토 후보 ${sensitivity.tuningCandidates.length}건`
      }
      description="예측 정확도를 높이기 위해 주요 설정과 보조 신호의 효과를 비교합니다. 결과는 참고용이며 자동으로 적용되지 않습니다."
      className="admin-sensitivity"
    >
      <div className="admin-detail-stack">
        <div className="admin-panel">
          <strong>현재 운영 설정</strong>
          <div className="admin-metric-grid">
            {listModelParamFields(currentParams).map((field) => (
              <div key={field.key} className="admin-metric">
                <span className="dashboard-shell__metric-label">{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
          </div>
          <p className="admin-decision__note">
            반영 시차 · 해당 시장 움직임을 몇 주 뒤 국내 경유가 예측에 반영하는지
          </p>
          <p className="admin-decision__note">
            비중 · 해당 시장 신호를 예측에 얼마나 반영하는지
          </p>
        </div>
        <TopCandidateSummary
          sensitivity={sensitivity}
          candidate={topCandidate}
          stageLabel={stageLabel}
        />
        <TuningFlowGuide />

        {sensitivity.groups.map((group) => (
          <SensitivityGroup
            key={group.key}
            group={group}
            current={sensitivity.currentRecentOneStep}
            rankByParamsKey={rankByParamsKey}
            dailySignal={sensitivity.dailySignal}
          />
        ))}

        <CombinationAnalysisPanel
          analysis={sensitivity.combinationAnalysis}
          rankByParamsKey={rankByParamsKey}
        />

        <div className="admin-panel sensitivity-candidates">
          <strong>튜닝 검토 후보</strong>
          <p className="admin-decision__note">
            1순위는 최근 13주의 다음 주 예측 성능을 우선 기준으로 선정합니다. 26주 성능과 최대 오차·변동성은
            품질 기준 확인에 함께 사용합니다.
          </p>
          <p className="admin-decision__note">
            매주 새 Actual 데이터로 후보를 다시 평가하며, 같은 후보가 2주 연속 1순위를 유지해야 Shadow
            검증으로 진행합니다.
            <br />
            최근 13주 MAE가 상대 5% · 절대 0.5원/L 이상 좋아질 때만 연속 확인 중인 후보를 교체합니다.
          </p>
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
                  topCandidate={sensitivity.tuningCandidates[0]}
                  comparison={
                    regimeComparisons.find(
                      (comparison) =>
                        comparison.paramsKey === serializeSensitivityParamsKey(candidate.params),
                    ) ?? null
                  }
                />
              ))}
            </ol>
          )}
          {persistence === null ? null : (
            <ShadowEntryStatus persistence={persistence} shadowActive={shadowActive} />
          )}
          <p className="admin-decision__note">
            후보는 과거 데이터 비교 결과입니다. 조합 후보도 실제 적용 전에 새 실제 데이터를 이용한 검증을
            거치며, 이 화면에서 운영 모델이나 파라미터를 변경하지 않습니다.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
