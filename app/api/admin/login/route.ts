import {
  AdminAccessError,
  AdminConfigurationError,
  createAdminSessionToken,
  readJsonBody,
  setAdminSessionCookie,
  validateSameOriginRequest,
  verifyAdminPassword,
} from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    validateSameOriginRequest(request);

    const body = await readJsonBody<{ password?: unknown }>(request, 4_096);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!password) {
      return Response.json(
        {
          ok: false,
          code: 'INVALID_REQUEST',
          message: '관리자 비밀번호가 올바르지 않습니다.',
        },
        { status: 400 },
      );
    }

    const isValidPassword = await verifyAdminPassword(password);

    if (!isValidPassword) {
      return Response.json(
        {
          ok: false,
          code: 'INVALID_CREDENTIALS',
          message: '관리자 비밀번호가 올바르지 않습니다.',
        },
        { status: 401 },
      );
    }

    const token = createAdminSessionToken();
    setAdminSessionCookie(token);

    return Response.json({
      ok: true,
      data: null,
      message: '관리자 로그인에 성공했습니다.',
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

    if (error instanceof AdminConfigurationError) {
      return Response.json(
        {
          ok: false,
          code: 'ADMIN_AUTH_NOT_CONFIGURED',
          message: error.message,
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '관리자 로그인을 처리하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
