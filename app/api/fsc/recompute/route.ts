import {
  AdminAccessError,
  readJsonBody,
  requireAdmin,
  validateSameOriginRequest,
} from '@/lib/auth/admin';
import { runFscResultRecompute } from '@/lib/fsc/run-fsc-result-recompute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin();
    validateSameOriginRequest(request);
    await readJsonBody<Record<string, never>>(request, 1_024);

    const result = await runFscResultRecompute();

    return Response.json({
      ok: true,
      data: {
        resultId: result.id,
        targetYear: result.targetYear,
        targetQuarter: result.targetQuarter,
      },
      message: '새 FSC 산출 결과를 생성했습니다.',
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

    console.error('Failed to recompute FSC result.', error);
    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'FSC 재계산을 수행하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
