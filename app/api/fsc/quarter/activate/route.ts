import { QuarterStatus } from '@prisma/client';

import {
  AdminAccessError,
  readJsonBody,
  requireAdmin,
  validateSameOriginRequest,
} from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { activateQuarter } from '@/lib/quarter/activate-quarter';
import { toQuarterNumber } from '@/lib/quarter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_QUARTER_LOCK_CLASS_ID = 17061;
const ACTIVE_QUARTER_LOCK_OBJECT_ID = 904;

function parseRequiredInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${name}는 정수여야 합니다.`);
  }

  return value;
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);

    const body = await readJsonBody<{ year?: unknown; quarter?: unknown }>(request, 2_048);
    const targetYear = parseRequiredInteger(body.year, 'year');
    const targetQuarter = toQuarterNumber(parseRequiredInteger(body.quarter, 'quarter'));

    const activated = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${ACTIVE_QUARTER_LOCK_CLASS_ID} AS integer), CAST(${ACTIVE_QUARTER_LOCK_OBJECT_ID} AS integer))`;

        const targetQuarterRow = await tx.quarterSetting.findUnique({
          where: {
            targetYear_targetQuarter: {
              targetYear,
              targetQuarter,
            },
          },
        });

        if (targetQuarterRow === null) {
          throw new Error('요청한 quarter가 존재하지 않습니다.');
        }

        if (targetQuarterRow.status === QuarterStatus.closed) {
          throw new Error('closed quarter는 기본 설정에서 재활성화할 수 없습니다.');
        }

        return activateQuarter(tx, targetQuarterRow.id);
      },
      {
        maxWait: 30_000,
        timeout: 120_000,
      },
    );

    return Response.json({
      ok: true,
      data: {
        targetYear: activated.targetYear,
        targetQuarter: activated.targetQuarter,
      },
      message: '선택한 quarter를 active로 전환했습니다.',
    });
  } catch (error) {
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

    const message = error instanceof Error ? error.message : 'quarter 활성화를 수행하지 못했습니다.';
    const status =
      message === '요청한 quarter가 존재하지 않습니다.' || message === 'closed quarter는 기본 설정에서 재활성화할 수 없습니다.'
        ? 409
        : 500;

    if (status === 500) {
      console.error('Failed to activate quarter.', error);
    }

    return Response.json(
      {
        ok: false,
        code: status === 409 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
        message,
      },
      { status },
    );
  }
}
