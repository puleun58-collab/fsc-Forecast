import { AdminDisclosureToggle } from './admin-disclosure-toggle';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import type { ForecastModelParams } from '@/lib/forecast/forecast-model-config';
import {
  describeModelParamChanges,
  diffModelParams,
  formatModelParams,
} from '@/lib/forecast/describe-model-params';
import type {
  TuningTimelineEvent,
  TuningTimelineEventType,
} from '@/lib/forecast/tuning-timeline';
import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';

const EVENT_VIEW: Record<TuningTimelineEventType, { title: string; tone: string }> = {
  'candidate-started': { title: '1순위 후보 확인 시작', tone: 'progress' },
  'candidate-confirmed': { title: '1순위 후보 유지', tone: 'progress' },
  'candidate-changed': { title: '1순위 후보가 변경됨', tone: 'neutral' },
  'candidate-cleared': { title: '기준 통과 후보 없음', tone: 'neutral' },
  'shadow-started': { title: 'Shadow 검증 시작', tone: 'progress' },
  'shadow-progress': { title: 'Shadow 검증 진행', tone: 'progress' },
  'shadow-completed': { title: 'Shadow 검증 완료', tone: 'ok' },
  'shadow-stopped': { title: 'Shadow 검증 중단', tone: 'warning' },
  'transition-approved': { title: '운영 적용 승인', tone: 'ok' },
  'transition-applied': { title: '운영 모델 적용', tone: 'ok' },
  'transition-cancelled': { title: '운영 전환 취소', tone: 'warning' },
  'transition-rolled-back': { title: '운영 설정 롤백', tone: 'warning' },
};

const TONE_CLASS: Record<string, string> = {
  ok: 'status-tag--ok',
  warning: 'status-tag--warning',
  progress: '',
  neutral: '',
};

/**
 * 1순위 배지는 후보가 실제로 존재하는 이벤트에만 붙인다.
 * Shadow·운영 전환 단계는 자체 상태 배지만 사용한다.
 */
const SHOWS_RANK_BADGE: Partial<Record<TuningTimelineEventType, true>> = {
  'candidate-started': true,
  'candidate-confirmed': true,
  'candidate-changed': true,
};

function describeWeek(weekEndDate: string | null): string {
  if (weekEndDate === null) {
    return '주차 정보 없음';
  }

  try {
    const { month, weekOfMonth } = getOpinetDisplayWeek(weekEndDate, weekEndDate);

    return `${month}월 ${weekOfMonth}주차`;
  } catch {
    return formatDashboardDate(weekEndDate);
  }
}

function describeCandidate(params: ForecastModelParams | null): string | null {
  return params === null ? null : formatModelParams(params);
}

function describeDetail(event: TuningTimelineEvent): string | null {
  if (event.shadowSampleCount !== null && event.shadowRequiredSampleCount !== null) {
    const progress = `Shadow ${event.shadowSampleCount}/${event.shadowRequiredSampleCount}주`;

    return event.shadowMaeKrwPerL === null
      ? progress
      : `${progress} · 누적 MAE ${formatPriceText(event.shadowMaeKrwPerL)}`;
  }

  if (event.confirmedCount !== null && event.requiredCount !== null) {
    const progress = `동일 후보 확인 ${event.confirmedCount}/${event.requiredCount}주`;

    return event.confirmedCount >= event.requiredCount ? `${progress} 완료` : progress;
  }

  return null;
}

export function AdminTuningTimeline({ events }: { events: readonly TuningTimelineEvent[] }) {
  // 가장 최근 후보 이벤트만 "이번 주 1순위"로 표시한다.
  const latestRankedIndex = events.findIndex(event => SHOWS_RANK_BADGE[event.type] === true);

  return (
    <details className="admin-panel admin-disclosure tuning-timeline">
      <summary className="admin-disclosure__summary">
        <strong>튜닝 진행 이력</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <p className="admin-decision__note">
          주차별 1순위 튜닝 후보의 변경 이력입니다. 현재 운영 설정 변경 이력이 아닙니다.
        </p>
        {events.length === 0 ? (
          <p className="backtest-detail__empty">
            이 기능 적용 이전 기록이라 남아 있는 튜닝 이력이 없습니다.
          </p>
        ) : (
          <ol className="tuning-timeline__list">
            {events.map((event, index) => {
              const view = EVENT_VIEW[event.type];
              const showsRank = SHOWS_RANK_BADGE[event.type] === true;
              const candidate = describeCandidate(event.candidateParams);
              const previous = describeCandidate(event.previousCandidateParams);
              const changed =
                event.previousCandidateParams === null || event.candidateParams === null
                  ? null
                  : describeModelParamChanges(
                      diffModelParams(event.previousCandidateParams, event.candidateParams),
                    );
              const detail = describeDetail(event);

              return (
                <li
                  key={`${event.type}-${event.occurredAt}-${index}`}
                  className={`tuning-timeline__item${index === 0 ? ' tuning-timeline__item--current' : ''}`}
                >
                  <div className="tuning-timeline__head">
                    <span className="tuning-timeline__week">{describeWeek(event.weekEndDate)}</span>
                    <span className={`status-tag ${TONE_CLASS[view.tone]}`.trim()}>{view.title}</span>
                    {showsRank ? (
                      <span className="status-tag status-tag--accent">
                        {index === latestRankedIndex ? '이번 주 1순위' : '당시 1순위'}
                      </span>
                    ) : null}
                  </div>
                  {candidate === null ? null : (
                    <p className="tuning-timeline__candidate">{candidate}</p>
                  )}
                  {previous === null ? null : (
                    <p className="admin-decision__note">이전 주 1순위 · {previous}</p>
                  )}
                  {changed === null ? null : (
                    <p className="tuning-timeline__change">이전 주 1순위 대비 변경 · {changed}</p>
                  )}
                  {event.type === 'candidate-changed' ? (
                    <p className="admin-decision__note">
                      후보 변경으로 동일 후보 확인 기간이 다시 시작됩니다.
                    </p>
                  ) : null}
                  {detail === null ? null : <p className="admin-decision__note">{detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}
