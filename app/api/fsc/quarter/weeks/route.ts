import { findFscResultById, findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
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
  const resultId = url.searchParams.get('resultId');

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

  if (resultId !== null && resultId.trim() === '') {
    return buildInvalidRequest('resultId는 비어 있을 수 없습니다.');
  }

  try {
    const result =
      resultId && resultId.trim().length > 0
        ? await findFscResultById(resultId.trim())
        : await findLatestBaseFscResultByQuarter(targetYear, targetQuarter);

    if (result === null || result.targetYear !== targetYear || result.targetQuarter !== targetQuarter) {
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
      data: {
        resultId: result.id,
        targetYear: result.targetYear,
        targetQuarter: result.targetQuarter,
        weeks: result.weeks.map((week) => ({
          sequenceNo: week.sequenceNo,
          targetMonth: week.targetMonth,
          weekNo: week.weekNo,
          weekStartDate: week.weekStartDate.toISOString(),
          weekEndDate: week.weekEndDate.toISOString(),
          priceKind: week.priceKind,
          priceKrwPerL: week.priceKrwPerL.toFixed(3),
          actualPriceKrwPerL: week.actualPriceKrwPerL?.toFixed(3) ?? null,
          forecastPriceKrwPerL: week.forecastPriceKrwPerL?.toFixed(3) ?? null,
          sourcePriceDate: week.sourcePriceDate?.toISOString() ?? null,
          forecastSourceKind: week.forecastSourceKind ?? null,
          fallbackUsed: week.fallbackUsed,
          basePriceKrwPerL: week.basePriceKrwPerL.toFixed(3),
          priceDiffKrwPerL: week.priceDiffKrwPerL.toFixed(3),
          diffRatio: week.diffRatio.toFixed(6),
        })),
      },
    });
  } catch (error) {
    console.error('Failed to load FSC quarter weeks.', error);

    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '분기 FSC 주차 데이터를 불러오지 못했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}
