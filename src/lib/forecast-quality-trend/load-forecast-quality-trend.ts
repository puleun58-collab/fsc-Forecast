import { db } from '@/lib/db';
import { assessForecastQuality } from '@/lib/fsc/forecast-quality-signal';
import { readFscReliabilityTrail } from '@/lib/fsc/reliability-trail';

import {
  buildForecastQualityTrend,
  FORECAST_QUALITY_CHART_LIMIT,
  type ForecastQualityTrend,
} from './forecast-quality-trend';

function toNumber(value: { toNumber: () => number } | null): number | null {
  return value === null ? null : value.toNumber();
}

export async function loadForecastQualityTrend(
  targetYear: number,
  targetQuarter: number,
): Promise<ForecastQualityTrend> {
  const quarterScope = { targetYear, targetQuarter, scenarioName: 'base' } as const;
  const latestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
  const [results, latest] = await Promise.all([
    db.fscResult.findMany({
      where: quarterScope,
      orderBy: [...latestFirst],
      take: FORECAST_QUALITY_CHART_LIMIT + 2,
      select: {
        id: true,
        createdAt: true,
        recent13wWeeklyPriceMape: true,
        recent13wWeeklyPriceMae: true,
        recent4wWeeklyPriceMae: true,
        recent26wWeeklyPriceMae: true,
        recent13wDirectionAccuracy: true,
        forecastBias4w: true,
        forecastBias13w: true,
      },
    }),
    db.fscResult.findFirst({
      where: quarterScope,
      orderBy: [...latestFirst],
      select: {
        calculationPayload: true,
        reliabilityGrade: true,
        reliabilitySampleCount: true,
        reliabilityMinimumSampleCount: true,
        recent4wErrorTrend: true,
        dataFreshnessStatus: true,
      },
    }),
  ]);
  const trail = readFscReliabilityTrail(latest?.calculationPayload ?? null);

  return buildForecastQualityTrend(
    results.map((result) => ({
      id: result.id,
      createdAt: result.createdAt.toISOString(),
      recent13wWeeklyPriceMape: toNumber(result.recent13wWeeklyPriceMape),
      recent13wWeeklyPriceMae: toNumber(result.recent13wWeeklyPriceMae),
      recent4wWeeklyPriceMae: toNumber(result.recent4wWeeklyPriceMae),
      recent26wWeeklyPriceMae: toNumber(result.recent26wWeeklyPriceMae),
      recent13wDirectionAccuracy: toNumber(result.recent13wDirectionAccuracy),
      forecastBias4w: toNumber(result.forecastBias4w),
      forecastBias13w: toNumber(result.forecastBias13w),
    })),
    assessForecastQuality({
      adjustmentReasons: trail.adjustmentReasons,
      reliabilityGrade: latest?.reliabilityGrade ?? null,
      reliabilitySampleCount: latest?.reliabilitySampleCount ?? 0,
      reliabilityMinimumSampleCount: latest?.reliabilityMinimumSampleCount ?? 13,
      recent4wErrorTrend: latest?.recent4wErrorTrend ?? trail.recent4wErrorTrend,
      dataFreshnessStatus: latest?.dataFreshnessStatus ?? trail.dataFreshnessStatus,
      hasReliabilityRecord: trail.baseGrade !== null,
    }),
  );
}
