import { db } from '@/lib/db';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';
import { serializeQuarterSetting } from '@/lib/quarter/serialize-quarter-setting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await ensureActiveQuarter();

    const quarters = await db.quarterSetting.findMany({
      orderBy: [{ targetYear: 'desc' }, { targetQuarter: 'desc' }],
    });

    return Response.json({
      ok: true,
      data: quarters.map((quarter) => serializeQuarterSetting(quarter)),
    });
  } catch (error) {
    console.error('Failed to load FSC quarter list.', error);

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'quarter 목록을 불러오지 못했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}
