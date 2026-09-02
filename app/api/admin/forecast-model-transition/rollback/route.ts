import { Prisma } from '@prisma/client';

import {
  AdminAccessError,
  readJsonBody,
  requireAdmin,
  validateSameOriginRequest,
} from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { FORECAST_MODEL_VERSION } from '@/lib/forecast/forecast-model-config';
import { resolveForecastModelState } from '@/lib/forecast/forecast-model-state';
import {
  evaluateRollbackEligibility,
  parseTransitionParams,
  type RollbackBlockReason,
} from '@/lib/forecast/model-transition';
import { readParameterSensitivity } from '@/lib/forecast/parameter-sensitivity';
import { readPostTransitionMonitoring } from '@/lib/forecast/post-transition-monitoring';
import { buildCandidateFingerprint } from '@/lib/forecast/shadow-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STALE_MESSAGE = '최신 성능 결과가 변경되었습니다. 화면을 새로고침한 후 다시 확인해 주세요.';

const BLOCK_MESSAGE: Record<RollbackBlockReason, string> = {
  monitoring_not_reviewable: '아직 이전 설정이 더 낫다고 판단할 근거가 충분하지 않습니다.',
  sample_not_complete: '전환 후 성능 비교가 아직 완료되지 않았습니다.',
  current_params_mismatch: '최신 운영 설정이 변경되어 다시 확인이 필요합니다.',
  model_version_mismatch: '예측 모델 버전이 변경되어 다시 확인이 필요합니다.',
  rollback_guardrail_broken: '이전 설정이 최신 분석에서 안정성 기준을 충족하지 못합니다.',
  cooldown_active: '운영 변경 보호 기간이 남아 있습니다.',
  already_approved: '다른 운영 설정 변경이 이미 승인되어 적용을 기다리고 있습니다.',
};

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);

    const body = await readJsonBody<{
      sourceTransitionId?: unknown;
      sourceForecastRunId?: unknown;
      rollbackFingerprint?: unknown;
    }>(request, 4_096);
    const sourceTransitionId =
      typeof body.sourceTransitionId === 'string' ? body.sourceTransitionId.trim() : '';
    const sourceForecastRunId =
      typeof body.sourceForecastRunId === 'string' ? body.sourceForecastRunId.trim() : '';
    const rollbackFingerprint =
      typeof body.rollbackFingerprint === 'string' ? body.rollbackFingerprint.trim() : '';

    if (!sourceTransitionId || !sourceForecastRunId || !rollbackFingerprint) {
      return Response.json(
        { ok: false, code: 'INVALID_REQUEST', message: '롤백 승인 요청 정보가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const latestRun = await db.forecastRun.findFirst({
      where: { status: 'succeeded' },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, metadata: true },
    });
    const monitoring = readPostTransitionMonitoring(latestRun?.metadata ?? null);

    if (
      latestRun === null ||
      latestRun.id !== sourceForecastRunId ||
      monitoring === null ||
      monitoring.sourceTransitionId !== sourceTransitionId
    ) {
      return Response.json({ ok: false, code: 'STALE_REQUEST', message: STALE_MESSAGE }, { status: 409 });
    }

    // 롤백 파라미터는 클라이언트 값이 아니라 적용된 원본 전환 기록에서 복원한다.
    const sourceTransition = await db.forecastModelTransition.findFirst({
      where: { id: sourceTransitionId, datasetKey: env.datasetKey, status: 'applied' },
    });

    if (sourceTransition === null) {
      return Response.json({ ok: false, code: 'STALE_REQUEST', message: STALE_MESSAGE }, { status: 409 });
    }
    const rollbackParams = parseTransitionParams(sourceTransition.baselineParams);

    const modelState = resolveForecastModelState(latestRun.metadata);
    const pending = await db.forecastModelTransition.findFirst({
      where: { datasetKey: env.datasetKey, status: 'approved_pending' },
      select: { id: true },
    });
    const eligibility = evaluateRollbackEligibility({
      monitoring,
      currentParams: modelState.params,
      currentPromotedAt: modelState.promotedAt,
      modelVersion: FORECAST_MODEL_VERSION,
      sensitivity: readParameterSensitivity(latestRun.metadata),
      hasPendingTransition: pending !== null,
      now: new Date(),
    });

    if (
      eligibility.rollbackFingerprint !== rollbackFingerprint ||
      buildCandidateFingerprint(rollbackParams, FORECAST_MODEL_VERSION) !== eligibility.rollbackFingerprint
    ) {
      return Response.json({ ok: false, code: 'STALE_REQUEST', message: STALE_MESSAGE }, { status: 409 });
    }

    if (!eligibility.eligible) {
      return Response.json(
        {
          ok: false,
          code: 'NOT_ELIGIBLE',
          message: BLOCK_MESSAGE[eligibility.blockReason ?? 'monitoring_not_reviewable'],
        },
        { status: 409 },
      );
    }

    const created = await db.forecastModelTransition.create({
      data: {
        datasetKey: env.datasetKey,
        shadowSessionId: `rollback:${sourceTransition.id}`,
        candidateFingerprint: eligibility.rollbackFingerprint,
        baselineFingerprint: eligibility.currentFingerprint,
        modelVersion: FORECAST_MODEL_VERSION,
        baselineParams: monitoring.currentParams as unknown as Prisma.InputJsonObject,
        candidateParams: rollbackParams as unknown as Prisma.InputJsonObject,
        shadowSummary: eligibility.summary as unknown as Prisma.InputJsonObject,
        candidateSource: 'post-transition-monitoring',
        sourceKind: 'post_transition_rollback',
        parentTransitionId: sourceTransition.id,
        sourceForecastRunId: latestRun.id,
        approvedAt: new Date(),
      },
      select: { status: true, approvedAt: true },
    });

    return Response.json({
      ok: true,
      data: { status: created.status, approvedAt: created.approvedAt },
      message: '이전 설정으로 롤백을 승인했습니다. 다음 예측 실행부터 적용됩니다.',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json(
        {
          ok: false,
          code: 'ALREADY_APPROVED',
          message: '다른 운영 설정 변경이 이미 승인되어 적용을 기다리고 있습니다.',
        },
        { status: 409 },
      );
    }

    if (error instanceof AdminAccessError) {
      return Response.json(
        {
          ok: false,
          code: error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: error.message,
        },
        { status: error.status },
      );
    }

    console.error('Failed to approve forecast model rollback.', error);
    return Response.json(
      { ok: false, code: 'INTERNAL_ERROR', message: '롤백 승인을 수행하지 못했습니다.' },
      { status: 500 },
    );
  }
}
