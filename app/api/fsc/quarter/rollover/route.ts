import { Prisma } from '@prisma/client';

import {
  AdminAccessError,
  readJsonBody,
  requireAdmin,
  validateSameOriginRequest,
} from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { rolloverActiveQuarter } from '@/lib/quarter/rollover-active-quarter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_QUARTER_LOCK_CLASS_ID = 17061;
const ACTIVE_QUARTER_LOCK_OBJECT_ID = 904;

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);

    const body = await readJsonBody<{ force?: unknown }>(request, 2_048);
    const force = body.force === true;
    const today = toDateOnly(new Date());

    const rolledQuarter = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${ACTIVE_QUARTER_LOCK_CLASS_ID} AS integer), CAST(${ACTIVE_QUARTER_LOCK_OBJECT_ID} AS integer))`;

        const activeQuarter = await tx.quarterSetting.findUnique({
          where: {
            activeKey: 'ACTIVE',
          },
        });

        if (activeQuarter === null) {
          throw new Error('현재 active quarter가 없습니다.');
        }

        if (!force && today.getTime() <= activeQuarter.quarterEndDate.getTime()) {
          return null;
        }

        const rolloverDate = force ? new Date(activeQuarter.quarterEndDate.getTime() + 86_400_000) : today;
        return rolloverActiveQuarter(tx, activeQuarter, rolloverDate);
      },
      {
        maxWait: 30_000,
        timeout: 120_000,
      },
    );

    if (rolledQuarter === null) {
      return Response.json(
        {
          ok: false,
          code: 'INVALID_REQUEST',
          message: '종료되지 않은 active quarter는 force=true 없이 rollover할 수 없습니다.',
        },
        { status: 409 },
      );
    }

    return Response.json({
      ok: true,
      data: {
        targetYear: rolledQuarter.targetYear,
        targetQuarter: rolledQuarter.targetQuarter,
      },
      message: 'active quarter rollover를 완료했습니다.',
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

    console.error('Failed to rollover active quarter.', error);
    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'active quarter rollover를 수행하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
