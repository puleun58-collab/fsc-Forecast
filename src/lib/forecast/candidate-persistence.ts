import { z } from "zod";

import { ForecastModelParamsSchema, type ForecastModelParams } from "./forecast-model-config";
import { buildCandidateFingerprint, type ShadowCandidateInput } from "./shadow-validation";

export const CANDIDATE_PERSISTENCE_VERSION = 1;
/** 서로 다른 새 주간 데이터에서 두 번 확인되어야 Shadow 검증을 시작한다. */
export const CANDIDATE_PERSISTENCE_REQUIRED_COUNT = 2;

export type CandidatePersistenceStatus = "waiting" | "confirming" | "confirmed" | "reset";

export interface CandidatePersistence {
  version: number;
  status: CandidatePersistenceStatus;
  candidateFingerprint: string | null;
  candidateParams: ForecastModelParams | null;
  candidateSource: string | null;
  confirmedCount: number;
  requiredCount: number;
  lastConfirmedWeekEndDate: string | null;
  startedAt: string | null;
  updatedAt: string;
}

export interface ResolveCandidatePersistenceInput {
  previous: CandidatePersistence | null;
  candidate: ShadowCandidateInput | null;
  modelVersion: string;
  /** 최신 확정 주간 데이터의 주차. 같은 주차 재실행은 진행도를 올리지 않는다. */
  latestWeekEndDate: Date | null;
  now: Date;
}

/** Shadow가 실제로 받아들일 수 있는 1순위 후보만 지속성 확인 대상이 된다. */
export function selectPersistenceCandidate(
  candidates: readonly ShadowCandidateInput[],
  baselineParams: ForecastModelParams,
  modelVersion: string,
): ShadowCandidateInput | null {
  const baselineFingerprint = buildCandidateFingerprint(baselineParams, modelVersion);

  return (
    candidates.find(
      (candidate) =>
        candidate.meetsPromotionQuality &&
        buildCandidateFingerprint(candidate.params, modelVersion) !== baselineFingerprint,
    ) ?? null
  );
}

export function resolveCandidatePersistence({
  previous,
  candidate,
  modelVersion,
  latestWeekEndDate,
  now,
}: ResolveCandidatePersistenceInput): CandidatePersistence {
  const updatedAt = now.toISOString();
  const empty: CandidatePersistence = {
    version: CANDIDATE_PERSISTENCE_VERSION,
    status: "waiting",
    candidateFingerprint: null,
    candidateParams: null,
    candidateSource: null,
    confirmedCount: 0,
    requiredCount: CANDIDATE_PERSISTENCE_REQUIRED_COUNT,
    lastConfirmedWeekEndDate: null,
    startedAt: null,
    updatedAt,
  };

  if (candidate === null) {
    // 후보가 사라지면 기존 확인 기록을 버린다.
    return previous === null || previous.candidateFingerprint === null
      ? empty
      : { ...empty, status: "reset" };
  }

  const fingerprint = buildCandidateFingerprint(candidate.params, modelVersion);
  const weekEndDate = latestWeekEndDate?.toISOString() ?? null;

  if (previous !== null && previous.candidateFingerprint === fingerprint) {
    // 같은 주차 데이터로 다시 실행된 경우에는 진행도를 올리지 않는다.
    if (weekEndDate === null || weekEndDate === previous.lastConfirmedWeekEndDate) {
      return { ...previous, requiredCount: CANDIDATE_PERSISTENCE_REQUIRED_COUNT, updatedAt };
    }

    const confirmedCount = Math.min(
      previous.confirmedCount + 1,
      CANDIDATE_PERSISTENCE_REQUIRED_COUNT,
    );

    return {
      ...previous,
      status: confirmedCount >= CANDIDATE_PERSISTENCE_REQUIRED_COUNT ? "confirmed" : "confirming",
      candidateParams: candidate.params,
      candidateSource: candidate.source,
      confirmedCount,
      requiredCount: CANDIDATE_PERSISTENCE_REQUIRED_COUNT,
      lastConfirmedWeekEndDate: weekEndDate,
      updatedAt,
    };
  }

  const changedFromOtherCandidate =
    previous !== null && previous.candidateFingerprint !== null;

  return {
    version: CANDIDATE_PERSISTENCE_VERSION,
    status: changedFromOtherCandidate ? "reset" : "confirming",
    candidateFingerprint: fingerprint,
    candidateParams: candidate.params,
    candidateSource: candidate.source,
    confirmedCount: weekEndDate === null ? 0 : 1,
    requiredCount: CANDIDATE_PERSISTENCE_REQUIRED_COUNT,
    lastConfirmedWeekEndDate: weekEndDate,
    startedAt: updatedAt,
    updatedAt,
  };
}

export function isShadowEntryConfirmed(
  persistence: CandidatePersistence,
  candidate: ShadowCandidateInput,
  modelVersion: string,
): boolean {
  return (
    persistence.confirmedCount >= persistence.requiredCount &&
    persistence.candidateFingerprint === buildCandidateFingerprint(candidate.params, modelVersion)
  );
}

const ModelParamsSchema = ForecastModelParamsSchema;

const PersistenceMetadataSchema = z.object({
  model: z.object({
    candidatePersistence: z.object({
      version: z.number(),
      status: z.enum(["waiting", "confirming", "confirmed", "reset"]),
      candidateFingerprint: z.string().nullable(),
      candidateParams: ModelParamsSchema.nullable(),
      candidateSource: z.string().nullable(),
      confirmedCount: z.number(),
      requiredCount: z.number(),
      lastConfirmedWeekEndDate: z.string().datetime().nullable(),
      startedAt: z.string().datetime().nullable(),
      updatedAt: z.string().datetime(),
    }),
  }),
});

export function readCandidatePersistence(metadata: unknown): CandidatePersistence | null {
  const parsed = PersistenceMetadataSchema.safeParse(metadata);

  return parsed.success
    ? (parsed.data.model.candidatePersistence as CandidatePersistence)
    : null;
}
