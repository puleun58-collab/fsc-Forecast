import { readCandidatePersistence, type CandidatePersistence } from "./candidate-persistence";
import type { ForecastModelParams } from "./forecast-model-config";
import {
  readShadowValidation,
  summarizeShadowValidation,
  type ShadowValidationSession,
} from "./shadow-validation";

export const TUNING_TIMELINE_DEFAULT_LIMIT = 20;

export type TuningTimelineEventType =
  | "candidate-started"
  | "candidate-confirmed"
  | "candidate-changed"
  | "candidate-cleared"
  | "shadow-started"
  | "shadow-progress"
  | "shadow-completed"
  | "shadow-stopped"
  | "transition-approved"
  | "transition-applied"
  | "transition-cancelled"
  | "transition-rolled-back";

export interface TuningTimelineEvent {
  type: TuningTimelineEventType;
  /** 새 실제 주간 데이터 기준. 전환 기록처럼 주차가 없으면 null. */
  weekEndDate: string | null;
  occurredAt: string;
  candidateParams: ForecastModelParams | null;
  previousCandidateParams: ForecastModelParams | null;
  confirmedCount: number | null;
  requiredCount: number | null;
  shadowSampleCount: number | null;
  shadowRequiredSampleCount: number | null;
  shadowMaeKrwPerL: number | null;
}

export interface TuningTimelineRunInput {
  id: string;
  completedAt: Date | string | null;
  metadata: unknown;
}

export interface TuningTimelineTransitionInput {
  approvedAt: string;
  appliedAt: string | null;
  status: "approved_pending" | "applied" | "cancelled";
  sourceKind: "shadow_admin_approved" | "post_transition_rollback";
  candidateParams: ForecastModelParams;
}

export interface BuildTuningTimelineInput {
  /** ForecastRun 목록. 정렬 순서는 상관없다. */
  runs: readonly TuningTimelineRunInput[];
  transitions?: readonly TuningTimelineTransitionInput[];
  limit?: number;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface RunSnapshot {
  runAt: string;
  persistence: CandidatePersistence | null;
  shadow: ShadowValidationSession | null;
}

function readRunSnapshots(runs: readonly TuningTimelineRunInput[]): RunSnapshot[] {
  return runs
    .flatMap((run) => {
      const runAt = toIso(run.completedAt);

      return runAt === null
        ? []
        : [
            {
              runAt,
              persistence: readCandidatePersistence(run.metadata),
              shadow: readShadowValidation(run.metadata),
            },
          ];
    })
    .sort((left, right) => left.runAt.localeCompare(right.runAt));
}

interface PersistenceState {
  fingerprint: string | null;
  params: ForecastModelParams | null;
  confirmedCount: number;
  weekEndDate: string | null;
}

function emitPersistenceEvents(
  snapshot: RunSnapshot,
  previous: PersistenceState,
): { events: TuningTimelineEvent[]; next: PersistenceState } {
  const { persistence } = snapshot;

  if (persistence === null) {
    return { events: [], next: previous };
  }

  const next: PersistenceState = {
    fingerprint: persistence.candidateFingerprint,
    params: persistence.candidateParams,
    confirmedCount: persistence.confirmedCount,
    weekEndDate: persistence.lastConfirmedWeekEndDate,
  };

  if (persistence.candidateFingerprint === null) {
    // 후보가 사라진 순간에만 한 번 기록한다.
    return previous.fingerprint === null
      ? { events: [], next }
      : {
          events: [
            {
              type: "candidate-cleared",
              weekEndDate: persistence.lastConfirmedWeekEndDate,
              occurredAt: snapshot.runAt,
              candidateParams: null,
              previousCandidateParams: previous.params,
              confirmedCount: null,
              requiredCount: persistence.requiredCount,
              shadowSampleCount: null,
              shadowRequiredSampleCount: null,
              shadowMaeKrwPerL: null,
            },
          ],
          next,
        };
  }

  const changed =
    previous.fingerprint !== null && previous.fingerprint !== persistence.candidateFingerprint;
  const sameProgress =
    previous.fingerprint === persistence.candidateFingerprint &&
    previous.confirmedCount === persistence.confirmedCount &&
    previous.weekEndDate === persistence.lastConfirmedWeekEndDate;

  // 같은 주차에서 worker가 여러 번 돌아도 진행도가 그대로면 이력을 늘리지 않는다.
  if (sameProgress) {
    return { events: [], next };
  }

  return {
    events: [
      {
        type: changed
          ? "candidate-changed"
          : previous.fingerprint === null
            ? "candidate-started"
            : "candidate-confirmed",
        weekEndDate: persistence.lastConfirmedWeekEndDate,
        occurredAt: snapshot.runAt,
        candidateParams: persistence.candidateParams,
        previousCandidateParams: changed ? previous.params : null,
        confirmedCount: persistence.confirmedCount,
        requiredCount: persistence.requiredCount,
        shadowSampleCount: null,
        shadowRequiredSampleCount: null,
        shadowMaeKrwPerL: null,
      },
    ],
    next,
  };
}

interface ShadowState {
  sessionId: string | null;
  completedSampleCount: number;
  status: ShadowValidationSession["status"] | null;
}

function emitShadowEvents(
  snapshot: RunSnapshot,
  previous: ShadowState,
): { events: TuningTimelineEvent[]; next: ShadowState } {
  const session = snapshot.shadow;

  if (session === null) {
    return { events: [], next: previous };
  }

  const summary = summarizeShadowValidation(session);
  const latestObservation = session.observations.at(-1) ?? null;
  const next: ShadowState = {
    sessionId: session.sessionId,
    completedSampleCount: summary.completedSampleCount,
    status: session.status,
  };
  const base = {
    weekEndDate: latestObservation?.originWeekEndDate ?? session.startedAt,
    occurredAt: snapshot.runAt,
    candidateParams: session.candidateParams,
    previousCandidateParams: null,
    confirmedCount: null,
    requiredCount: null,
    shadowSampleCount: summary.completedSampleCount,
    shadowRequiredSampleCount: summary.requiredSampleCount,
    shadowMaeKrwPerL: summary.shadow.maeKrwPerL,
  };
  const events: TuningTimelineEvent[] = [];
  const statusChanged = previous.status !== session.status;
  // 종료된 주에는 진행 이벤트를 따로 남기지 않는다. 같은 순간을 두 줄로 보여줄 이유가 없다.
  const terminal =
    statusChanged && (session.status === "reviewable" || session.status === "failed" || session.status === "stopped");

  if (previous.sessionId !== session.sessionId) {
    events.push({ ...base, type: "shadow-started", shadowMaeKrwPerL: null });
  } else if (!terminal && previous.completedSampleCount !== summary.completedSampleCount) {
    events.push({ ...base, type: "shadow-progress" });
  }

  if (terminal) {
    events.push({
      ...base,
      type: session.status === "reviewable" ? "shadow-completed" : "shadow-stopped",
    });
  }

  return { events, next };
}

function transitionEvents(
  transitions: readonly TuningTimelineTransitionInput[],
): TuningTimelineEvent[] {
  return transitions.flatMap((transition) => {
    const base = {
      weekEndDate: null,
      candidateParams: transition.candidateParams,
      previousCandidateParams: null,
      confirmedCount: null,
      requiredCount: null,
      shadowSampleCount: null,
      shadowRequiredSampleCount: null,
      shadowMaeKrwPerL: null,
    };
    const events: TuningTimelineEvent[] = [
      {
        ...base,
        type: transition.status === "cancelled" ? "transition-cancelled" : "transition-approved",
        occurredAt: transition.approvedAt,
      },
    ];

    if (transition.status === "applied" && transition.appliedAt !== null) {
      events.push({
        ...base,
        type:
          transition.sourceKind === "post_transition_rollback"
            ? "transition-rolled-back"
            : "transition-applied",
        occurredAt: transition.appliedAt,
      });
    }

    return events;
  });
}

/** 같은 시각에 여러 단계가 기록되면 흐름상 나중 단계가 최신이다. */
function stageWeight(type: TuningTimelineEventType): number {
  if (type.startsWith("transition-")) {
    return 2;
  }

  return type.startsWith("shadow-") ? 1 : 0;
}

/**
 * 저장된 run metadata와 전환 기록에서 상태가 실제로 바뀐 순간만 뽑아 이력을 만든다.
 * 새 상태 머신을 만들지 않으며, 과거 값을 추정해 채우지도 않는다.
 */
export function buildTuningTimeline({
  runs,
  transitions = [],
  limit = TUNING_TIMELINE_DEFAULT_LIMIT,
}: BuildTuningTimelineInput): TuningTimelineEvent[] {
  let persistenceState: PersistenceState = {
    fingerprint: null,
    params: null,
    confirmedCount: 0,
    weekEndDate: null,
  };
  let shadowState: ShadowState = { sessionId: null, completedSampleCount: 0, status: null };
  const events: TuningTimelineEvent[] = [];

  for (const snapshot of readRunSnapshots(runs)) {
    const persistence = emitPersistenceEvents(snapshot, persistenceState);
    persistenceState = persistence.next;
    events.push(...persistence.events);

    const shadow = emitShadowEvents(snapshot, shadowState);
    shadowState = shadow.next;
    events.push(...shadow.events);
  }

  events.push(...transitionEvents(transitions));

  return events
    .sort((left, right) => {
      const byTime = right.occurredAt.localeCompare(left.occurredAt);

      // 같은 실행에서 나온 이벤트는 더 진행된 단계를 위에 둔다.
      return byTime === 0 ? stageWeight(right.type) - stageWeight(left.type) : byTime;
    })
    .slice(0, limit);
}
