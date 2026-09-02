import {
  AdminAccessError,
  readJsonBody,
  requireAdmin,
  validateSameOriginRequest,
} from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { env } from '@/lib/env';
import { FORECAST_MODEL_VERSION } from '@/lib/forecast/forecast-model-config';
import { resolveForecastModelState } from '@/lib/forecast/forecast-model-state';
import { evaluateTransitionEligibility, type TransitionBlockReason } from '@/lib/forecast/model-transition';
import { readParameterSensitivity } from '@/lib/forecast/parameter-sensitivity';
import { readShadowValidation } from '@/lib/forecast/shadow-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOCK_MESSAGE: Record<TransitionBlockReason, string> = {
  shadow_not_reviewable: 'Shadow 검증이 아직 완료되지 않았습니다.',
  sample_not_complete: 'Shadow 검증이 아직 완료되지 않았습니다.',
  baseline_mismatch: '최신 운영 설정이 변경되어 다시 확인이 필요합니다.',
  model_version_mismatch: '예측 모델 버전이 변경되어 다시 확인이 필요합니다.',
  candidate_equals_baseline: '이미 현재 운영 설정과 동일한 후보입니다.',
  candidate_guardrail_broken: '최신 분석에서 안정성 기준을 충족하지 못해 전환할 수 없습니다.',
  cooldown_active: '운영 변경 보호 기간이 남아 있습니다.',
  already_approved: '이미 전환 승인이 완료된 후보입니다.',
};

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);

    const body = await readJsonBody<{
      shadowSessionId?: unknown;
      candidateFingerprint?: unknown;
      sourceForecastRunId?: unknown;
    }>(request, 4_096);
    const shadowSessionId = typeof body.shadowSessionId === 'string' ? body.shadowSessionId.trim() : '';
    const candidateFingerprint =
      typeof body.candidateFingerprint === 'string' ? body.candidateFingerprint.trim() : '';
    const sourceForecastRunId =
      typeof body.sourceForecastRunId === 'string' ? body.sourceForecastRunId.trim() : '';

    if (!shadowSessionId || !candidateFingerprint || !sourceForecastRunId) {
      return Response.json(
        { ok: false, code: 'INVALID_REQUEST', message: '전환 승인 요청 정보가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const latestRun = await db.forecastRun.findFirst({
      where: { status: 'succeeded' },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, metadata: true, completedAt: true, createdAt: true },
    });

    if (latestRun === null || latestRun.id !== sourceForecastRunId) {
      return Response.json(
        {
          ok: false,
          code: 'STALE_REQUEST',
          message: '최신 검증 결과가 변경되었습니다. 화면을 새로고침한 후 다시 확인해 주세요.',
        },
        { status: 409 },
      );
    }

    const session = readShadowValidation(latestRun.metadata);
    const modelState = resolveForecastModelState(latestRun.metadata);

    if (session === null || session.sessionId !== shadowSessionId) {
      return Response.json(
        {
          ok: false,
          code: 'STALE_REQUEST',
          message: '최신 검증 결과가 변경되었습니다. 화면을 새로고침한 후 다시 확인해 주세요.',
        },
        { status: 409 },
      );
    }

    const pending = await db.forecastModelTransition.findFirst({
      where: { datasetKey: env.datasetKey, status: 'approved_pending' },
      select: { id: true },
    });
    const eligibility = evaluateTransitionEligibility({
      session,
      currentParams: modelState.params,
      currentPromotedAt: modelState.promotedAt,
      modelVersion: FORECAST_MODEL_VERSION,
      sensitivity: readParameterSensitivity(latestRun.metadata),
      hasPendingTransition: pending !== null,
      now: new Date(),
    });

    if (eligibility.candidateFingerprint !== candidateFingerprint) {
      return Response.json(
        {
          ok: false,
          code: 'STALE_REQUEST',
          message: '최신 검증 결과가 변경되었습니다. 화면을 새로고침한 후 다시 확인해 주세요.',
        },
        { status: 409 },
      );
    }

    if (!eligibility.eligible) {
      return Response.json(
        {
          ok: false,
          code: 'NOT_ELIGIBLE',
          message: BLOCK_MESSAGE[eligibility.blockReason ?? 'shadow_not_reviewable'],
        },
        { status: 409 },
      );
    }

    const transition = await db.forecastModelTransition.create({
      data: {
        datasetKey: env.datasetKey,
        shadowSessionId: session.sessionId,
        candidateFingerprint: eligibility.candidateFingerprint,
        baselineFingerprint: eligibility.baselineFingerprint,
        modelVersion: FORECAST_MODEL_VERSION,
        baselineParams: session.baselineParams as unknown as Prisma.InputJsonObject,
        candidateParams: session.candidateParams as unknown as Prisma.InputJsonObject,
        shadowSummary: eligibility.summary as unknown as Prisma.InputJsonObject,
        candidateSource: session.candidateSource,
        sourceForecastRunId: latestRun.id,
        approvedAt: new Date(),
      },
      select: { id: true, status: true, approvedAt: true },
    });

    return Response.json({
      ok: true,
      data: { status: transition.status, approvedAt: transition.approvedAt },
      message: '운영 전환을 승인했습니다. 다음 예측 실행부터 새 설정이 적용됩니다.',
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

    console.error('Failed to approve forecast model transition.', error);
    return Response.json(
      { ok: false, code: 'INTERNAL_ERROR', message: '운영 전환 승인을 수행하지 못했습니다.' },
      { status: 500 },
    );
  }
}
