import {
  AdminAccessError,
  readJsonBody,
  requireAdmin,
  validateSameOriginRequest,
} from '@/lib/auth/admin';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);

    const body = await readJsonBody<{ resultId?: unknown }>(request, 2_048);
    const resultId = typeof body.resultId === 'string' ? body.resultId.trim() : '';

    if (!resultId) {
      return Response.json(
        {
          ok: false,
          code: 'INVALID_REQUEST',
          message: 'resultId가 필요합니다.',
        },
        { status: 400 },
      );
    }

    const updated = await db.fscResult.update({
      where: {
        id: resultId,
      },
      data: {
        approvalStatus: 'approved',
        approvedBy: 'password-admin',
        approvedAt: new Date(),
      },
      select: {
        id: true,
        targetYear: true,
        targetQuarter: true,
        approvalStatus: true,
      },
    });

    return Response.json({
      ok: true,
      data: updated,
      message: '선택한 FSC 결과를 승인했습니다.',
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

    console.error('Failed to approve FSC result.', error);
    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'FSC 결과 승인을 수행하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
