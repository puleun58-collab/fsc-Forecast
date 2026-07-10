import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
import { toQuarterNumber } from '@/lib/quarter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildInvalidRequest(message: string): Response {
  return Response.json(
    {
      ok: false,
      code: 'INVALID_REQUEST',
      message,
    },
    {
      status: 400,
    },
  );
}

function parseRequiredInteger(value: string | null, name: string): number {
  if (value === null || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }

  return parsed;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const quarterParam = url.searchParams.get('quarter');

  if ((yearParam === null) !== (quarterParam === null)) {
    return buildInvalidRequest('year와 quarter는 함께 전달해야 합니다.');
  }

  if (yearParam === null || quarterParam === null) {
    return buildInvalidRequest('year와 quarter가 필요합니다.');
  }

  let targetYear: number;
  let targetQuarter: number;

  try {
    targetYear = parseRequiredInteger(yearParam, 'year');
    targetQuarter = toQuarterNumber(parseRequiredInteger(quarterParam, 'quarter'));
  } catch (error) {
    return buildInvalidRequest(error instanceof Error ? error.message : '요청값이 올바르지 않습니다.');
  }

  try {
    const result = await findLatestBaseFscResultByQuarter(targetYear, targetQuarter);

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
    console.error('Failed to load FSC quarter result.', error);

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '분기 FSC 산출 결과를 불러오지 못했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}
