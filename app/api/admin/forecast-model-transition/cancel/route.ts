import { AdminAccessError, requireAdmin, validateSameOriginRequest } from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);

    const cancelled = await db.forecastModelTransition.updateMany({
      where: { datasetKey: env.datasetKey, status: 'approved_pending' },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'cancelled_by_admin',
      },
    });

    if (cancelled.count === 0) {
      return Response.json(
        {
          ok: false,
          code: 'NOT_FOUND',
          message: '취소할 전환 승인이 없습니다.',
        },
        { status: 409 },
      );
    }

    return Response.json({
      ok: true,
      data: { cancelledCount: cancelled.count },
      message: '운영 전환 승인을 취소했습니다.',
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

    console.error('Failed to cancel forecast model transition.', error);
    return Response.json(
      { ok: false, code: 'INTERNAL_ERROR', message: '운영 전환 승인 취소를 수행하지 못했습니다.' },
      { status: 500 },
    );
  }
}
