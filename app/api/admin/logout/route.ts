import {
  AdminAccessError,
  clearAdminSessionCookie,
  readJsonBody,
  validateSameOriginRequest,
} from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    validateSameOriginRequest(request);
    await readJsonBody<Record<string, never>>(request, 1_024);
    clearAdminSessionCookie();

    return Response.json({
      ok: true,
      data: null,
      message: '로그아웃되었습니다.',
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

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '로그아웃을 처리하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
