import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const activeQuarter = await ensureActiveQuarter();
    const result = await findLatestBaseFscResultByQuarter(activeQuarter.targetYear, activeQuarter.targetQuarter);

    if (result === null) {
      return Response.json({
        ok: true,
        data: null,
        empty: true,
        code: 'FSC_RESULT_NOT_FOUND',
        message: '아직 FSC 산출 결과가 없습니다.',
      });
    }

    return Response.json({
      ok: true,
      data: serializeFscResultDto(result),
    });
  } catch (error) {
    console.error('Failed to load current FSC result.', error);

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '현재 FSC 산출 결과를 불러오지 못했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}
