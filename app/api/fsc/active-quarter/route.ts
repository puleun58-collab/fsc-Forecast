import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';
import { serializeQuarterSetting } from '@/lib/quarter/serialize-quarter-setting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const quarter = await ensureActiveQuarter();

    return Response.json({
      ok: true,
      data: serializeQuarterSetting(quarter),
    });
  } catch (error) {
    console.error('Failed to load active FSC quarter.', error);

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '현재 active quarter를 불러오지 못했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}
