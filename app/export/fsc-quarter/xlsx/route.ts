import { Buffer } from 'node:buffer';

import { buildFscExportDataset } from '@/lib/fsc/build-fsc-export-dataset';
import { buildFscXlsx } from '@/lib/fsc/build-fsc-xlsx';
import { toQuarterNumber } from '@/lib/quarter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseInteger(value: string | null, name: string): number {
  if (value === null || value.trim() === '') {
    throw new Error(`${name}가 필요합니다.`);
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name}는 정수여야 합니다.`);
  }

  return parsed;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const quarterParam = url.searchParams.get('quarter');

  if ((yearParam === null) !== (quarterParam === null)) {
    return new Response('year와 quarter는 함께 전달해야 합니다.', {
      status: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  let year: number | undefined;
  let quarter: number | undefined;

  try {
    if (yearParam !== null && quarterParam !== null) {
      year = parseInteger(yearParam, 'year');
      quarter = toQuarterNumber(parseInteger(quarterParam, 'quarter'));
    }
  } catch (error) {
    return new Response(error instanceof Error ? error.message : '요청값이 올바르지 않습니다.', {
      status: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  const result = await buildFscExportDataset({ year, quarter });

  if (result.status === 'missing_result' || result.dataset === null) {
    return new Response(`${result.targetYear}년 ${result.targetQuarter}분기 FSC 산출 결과가 아직 없습니다.`, {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const body = Buffer.from(buildFscXlsx(result.dataset));

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${result.dataset.fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
