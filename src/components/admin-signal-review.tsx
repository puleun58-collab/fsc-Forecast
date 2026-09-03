import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';
import type {
  ForecastSignalContribution,
  ForecastSignalKey,
  SignalContribution,
  SignalContributionStatus,
  SignalContributionWindow,
} from '@/lib/forecast/signal-contribution';
import {
  summarizeSignalForwardValidation,
  type SignalForwardStatus,
  type SignalForwardSummary,
  type SignalForwardValidation,
} from '@/lib/forecast/signal-forward-validation';
import type { SignalReviewDecision, SignalReviewStatus } from '@/lib/forecast/signal-review';

export const SIGNAL_LABEL: Record<ForecastSignalKey, string> = {
  trend: 'Trend',
  dubai: 'Dubai',
  usdKrw: 'USD/KRW',
  bias: 'Bias 보정',
  dailySignal: '일별 단기 신호',
};

const CONTRIBUTION_STATUS_LABEL: Record<SignalContributionStatus, string> = {
  helpful: '개선 기여',
  harmful: '악화 가능성',
  mixed: '효과 혼재',
  neutral: '거의 동일',
  'insufficient-sample': '표본 부족',
  'not-used': '현재 미사용',
  'not-separable': '구조상 독립 제거 비교 불가',
};

const FORWARD_STATUS_LABEL: Record<SignalForwardStatus, string> = {
  validating: '검증 중',
  improved: '실전 개선 확인',
  worsened: '실전 악화 가능성',
  mixed: '효과 혼재',
  'insufficient-sample': '검증 불가',
};

const REVIEW_STATUS_VIEW: Record<SignalReviewStatus, { label: string; className: string }> = {
  keep: { label: '유지 권장', className: 'status-tag--ok' },
  watch: { label: '관찰 유지', className: '' },
  'review-removal': { label: '축소·제거 검토', className: 'status-tag--warning' },
  undecided: { label: '판단 보류', className: '' },
};

/** 부호 대신 개선/악화로 읽히도록 문장으로 바꾼다. */
function describeMaeContribution(value: number | null): string {
  if (value === null) {
    return '산정 전';
  }

  if (value === 0) {
    return '차이 없음';
  }

  return `MAE ${formatPriceText(Math.abs(value))} ${value > 0 ? '개선 기여' : '악화 가능성'}`;
}

function describeMapeContribution(value: number | null): string {
  if (value === null) {
    return '산정 전';
  }

  if (value === 0) {
    return '차이 없음';
  }

  return `MAPE ${Math.abs(value).toFixed(2)}%p ${value > 0 ? '개선 기여' : '악화 가능성'}`;
}

function WindowDetail({ title, window }: { title: string; window: SignalContributionWindow }) {
  return (
    <div className="signal-review__window">
      <span className="dashboard-shell__metric-label">
        {title} · 비교 가능 {window.sampleCount}주
      </span>
      <p>
        현재 {window.baselineMaeKrwPerL === null ? '산정 전' : formatPriceText(window.baselineMaeKrwPerL)}
        {' → '}
        제거 {window.ablatedMaeKrwPerL === null ? '산정 전' : formatPriceText(window.ablatedMaeKrwPerL)}
      </p>
      <p>{describeMaeContribution(window.maeContributionKrwPerL)}</p>
      <p>{describeMapeContribution(window.mapeContributionPctPoint)}</p>
    </div>
  );
}

function ContributionRow({ signal }: { signal: SignalContribution }) {
  return (
    <li className="signal-review__item">
      <div className="signal-review__head">
        <strong>{SIGNAL_LABEL[signal.signal]}</strong>
        <span className="status-tag">{CONTRIBUTION_STATUS_LABEL[signal.status]}</span>
      </div>
      {signal.recent === null || signal.long === null ? null : (
        <>
          <p className="admin-decision__note">
            최근 {signal.recent.windowWeeks}주 · {describeMaeContribution(signal.recent.maeContributionKrwPerL)}
          </p>
          <p className="admin-decision__note">
            최근 {signal.long.windowWeeks}주 · {describeMaeContribution(signal.long.maeContributionKrwPerL)}
          </p>
          <details className="admin-disclosure admin-disclosure--inline">
            <summary className="admin-disclosure__summary">
              <span>상세 보기</span>
              <AdminDisclosureToggle />
            </summary>
            <div className="admin-disclosure__body signal-review__windows">
              <WindowDetail title={`최근 ${signal.recent.windowWeeks}주`} window={signal.recent} />
              <WindowDetail title={`최근 ${signal.long.windowWeeks}주`} window={signal.long} />
            </div>
          </details>
        </>
      )}
    </li>
  );
}

function ForwardRow({ summary }: { summary: SignalForwardSummary }) {
  return (
    <li className="signal-review__item">
      <div className="signal-review__head">
        <strong>{SIGNAL_LABEL[summary.signal]}</strong>
        <span className="status-tag">
          {FORWARD_STATUS_LABEL[summary.status]}
          {summary.status === 'validating'
            ? ` · ${summary.completedSampleCount}/${summary.requiredSampleCount}주`
            : ''}
        </span>
      </div>
      <p className="admin-decision__note">
        운영 {summary.baselineMaeKrwPerL === null ? '산정 전' : formatPriceText(summary.baselineMaeKrwPerL)}
        {' → '}
        제거 {summary.ablatedMaeKrwPerL === null ? '산정 전' : formatPriceText(summary.ablatedMaeKrwPerL)}
      </p>
      <p className="admin-decision__note">{describeMaeContribution(summary.maeContributionKrwPerL)}</p>
      <p className="admin-decision__note">{describeMapeContribution(summary.mapeContributionPctPoint)}</p>
    </li>
  );
}

function ReviewRow({ decision }: { decision: SignalReviewDecision }) {
  const view = REVIEW_STATUS_VIEW[decision.status];

  return (
    <li className="signal-review__item">
      <div className="signal-review__head">
        <strong>{SIGNAL_LABEL[decision.signal]}</strong>
        <span className={`status-tag ${view.className}`.trim()}>{view.label}</span>
      </div>
      <p className="admin-decision__note">
        과거 ·{' '}
        {decision.backtestVerdict === null
          ? '분석 없음'
          : CONTRIBUTION_STATUS_LABEL[decision.backtestVerdict]}
      </p>
      <p className="admin-decision__note">
        실전 ·{' '}
        {decision.forwardVerdict === null
          ? '검증 시작 전'
          : `${FORWARD_STATUS_LABEL[decision.forwardVerdict]} · ${decision.forwardSampleCount}/${decision.forwardRequiredSampleCount}주`}
      </p>
      {decision.status === 'review-removal' ? (
        <p className="admin-decision__note">
          다음 단계 · 미사용·축소 설정을 기존 튜닝 후보 비교에서 확인합니다.
        </p>
      ) : null}
      {decision.reasons.includes('data-quality-degraded') ? (
        <p className="admin-decision__note">데이터 상태 문제로 사용 표본이 줄었을 수 있습니다.</p>
      ) : null}
    </li>
  );
}

export function AdminSignalReview({
  contribution,
  forwardValidation,
  review,
}: {
  contribution: ForecastSignalContribution | null;
  forwardValidation: SignalForwardValidation | null;
  review: readonly SignalReviewDecision[];
}) {
  const forwardSummaries = summarizeSignalForwardValidation(forwardValidation);

  if (contribution === null) {
    return (
      <SectionCard
        title="예측 신호 기여도"
        badge="분석 없음"
        description="현재 운영 설정에서 각 신호를 하나씩 제외해 다음 주 예측 정확도 변화를 비교합니다."
        className="admin-signal-review"
        emptyStateTitle="신호 기여도 분석 이력이 없습니다."
        emptyStateCopy="다음 예측 실행부터 신호별 비교가 시작됩니다."
      />
    );
  }

  return (
    <SectionCard
      title="예측 신호 기여도"
      badge={`신호 ${contribution.signals.length}개`}
      description="현재 운영 설정에서 각 신호를 하나씩 제외해 다음 주 예측 정확도 변화를 비교합니다. 결과는 진단용이며 자동으로 적용되지 않습니다."
      className="admin-signal-review"
    >
      <div className="admin-detail-stack">
        <div className="admin-panel">
          <strong>과거 백테스트 기여도</strong>
          <ul className="signal-review__list">
            {contribution.signals.map((signal) => (
              <ContributionRow key={signal.signal} signal={signal} />
            ))}
          </ul>
        </div>

        <div className="admin-panel">
          <strong>실전 신호 검증</strong>
          <p className="admin-decision__note">
            새 실제 데이터가 들어올 때 각 신호를 사용한 예측과 제외한 예측을 비교합니다.
          </p>
          {forwardSummaries.length === 0 ? (
            <p className="backtest-detail__empty">아직 실전 검증 표본이 없습니다.</p>
          ) : (
            <ul className="signal-review__list">
              {forwardSummaries.map((summary) => (
                <ForwardRow key={summary.signal} summary={summary} />
              ))}
            </ul>
          )}
        </div>

        <div className="admin-panel">
          <strong>신호 운영 검토</strong>
          {review.length === 0 ? (
            <p className="backtest-detail__empty">판단 보류 · 검증 데이터 부족</p>
          ) : (
            <ul className="signal-review__list">
              {review.map((decision) => (
                <ReviewRow key={decision.signal} decision={decision} />
              ))}
            </ul>
          )}
          <p className="admin-decision__note">
            이 판단은 진단 결과이며, 신호를 자동으로 끄거나 운영 파라미터를 바꾸지 않습니다.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
