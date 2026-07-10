import { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';

import { buildFscQuarterWeeks } from './build-fsc-quarter-weeks';
import { calculateFscReliability } from './calculate-fsc-reliability';
import { calculateFscResult } from './calculate-fsc-result';
import { loadFscSourceData } from './load-fsc-source-data';
import type { FscResultRecord } from './serialize-fsc-dto';

const FSC_RECOMPUTE_LOCK_CLASS_ID = 17061;
const FSC_RECOMPUTE_LOCK_OBJECT_ID = 905;

export async function runFscResultRecompute(now = new Date()): Promise<FscResultRecord> {
  const activeQuarter = await ensureActiveQuarter();

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${FSC_RECOMPUTE_LOCK_CLASS_ID} AS integer), CAST(${FSC_RECOMPUTE_LOCK_OBJECT_ID} AS integer))`;

      const quarterSetting = await tx.quarterSetting.findUnique({
        where: {
          id: activeQuarter.id,
        },
      });

      if (quarterSetting === null) {
        throw new Error('Active quarter disappeared before FSC recomputation could start.');
      }

      const sourceData = await loadFscSourceData(tx);
      const quarterWeeks = buildFscQuarterWeeks({
        quarterSetting,
        currentTruthCutoffAt: sourceData.recomputeSnapshot.currentTruthCutoffAt,
        dailyPrices: sourceData.dailyPrices,
        forecastRun: sourceData.forecastRun,
      });
      const calculation = calculateFscResult({
        basePriceKrwPerL: quarterSetting.basePriceKrwPerL,
        appliedPriceKrwPerL: quarterSetting.appliedPriceKrwPerL,
        quarterAverageKrwPerL: quarterWeeks.quarterAverageKrwPerL,
        fscLowRate: quarterSetting.fscLowRate,
        fscHighRate: quarterSetting.fscHighRate,
      });
      const reliability = calculateFscReliability({
        forecastRun: sourceData.forecastRun,
        currentTruthCutoffAt: sourceData.recomputeSnapshot.currentTruthCutoffAt,
        now,
      });

      const created = await tx.fscResult.create({
        data: {
          quarterSettingId: quarterSetting.id,
          targetYear: quarterSetting.targetYear,
          targetQuarter: quarterSetting.targetQuarter,
          scenarioName: 'base',
          sourceRecomputeSnapshotId: sourceData.recomputeSnapshot.id,
          forecastRunId: sourceData.forecastRun?.id ?? null,
          calculationFormulaVersion: calculation.calculationFormulaVersion,
          forecastModelVersion: sourceData.forecastRun?.forecastModelVersion ?? null,
          basePriceKrwPerL: calculation.basePriceKrwPerL,
          appliedPriceKrwPerL: calculation.appliedPriceKrwPerL,
          quarterAverageKrwPerL: calculation.quarterAverageKrwPerL,
          priceDiffKrwPerL: calculation.priceDiffKrwPerL,
          diffRatio: calculation.diffRatio,
          fscLowRate: calculation.fscLowRate,
          fscHighRate: calculation.fscHighRate,
          fscLowKrwPerL: calculation.fscLowKrwPerL,
          fscHighKrwPerL: calculation.fscHighKrwPerL,
          actualWeekCount: quarterWeeks.actualWeekCount,
          forecastWeekCount: quarterWeeks.forecastWeekCount,
          recent13wWeeklyPriceMae: reliability.recent13wWeeklyPriceMae,
          recent13wWeeklyPriceMape: reliability.recent13wWeeklyPriceMape,
          recent13wQuarterAveragePriceMae: reliability.recent13wQuarterAveragePriceMae,
          recent13wDirectionAccuracy: reliability.recent13wDirectionAccuracy,
          recent4wWeeklyPriceMae: reliability.recent4wWeeklyPriceMae,
          recent4wErrorTrend: reliability.recent4wErrorTrend,
          recent26wWeeklyPriceMae: reliability.recent26wWeeklyPriceMae,
          forecastBias4w: reliability.forecastBias4w,
          forecastBias13w: reliability.forecastBias13w,
          reliabilityGrade: reliability.reliabilityGrade,
          dataFreshnessStatus: reliability.dataFreshnessStatus,
          calculationPayload: {
            source: {
              sourceRecomputeSnapshotId: sourceData.recomputeSnapshot.id,
              forecastRunId: sourceData.forecastRun?.id ?? null,
              currentTruthCutoffAt: sourceData.recomputeSnapshot.currentTruthCutoffAt?.toISOString() ?? null,
              dailyPriceCount: sourceData.dailyPrices.length,
            },
            quarterAverageKrwPerL: calculation.quarterAverageKrwPerL.toFixed(3),
            actualWeekCount: quarterWeeks.actualWeekCount,
            forecastWeekCount: quarterWeeks.forecastWeekCount,
            ...((quarterWeeks.calculationPayload as Prisma.InputJsonObject) ?? {}),
          },
          weeks: {
            create: quarterWeeks.weeks.map((week) => ({
              targetYear: week.targetYear,
              targetQuarter: week.targetQuarter,
              targetMonth: week.targetMonth,
              weekNo: week.weekNo,
              sequenceNo: week.sequenceNo,
              weekStartDate: week.weekStartDate,
              weekEndDate: week.weekEndDate,
              priceKind: week.priceKind,
              priceKrwPerL: week.priceKrwPerL,
              actualPriceKrwPerL: week.actualPriceKrwPerL,
              forecastPriceKrwPerL: week.forecastPriceKrwPerL,
              sourcePriceDate: week.sourcePriceDate,
              sourceRevisionIds: week.sourceRevisionIds ?? Prisma.JsonNull,
              forecastPointId: week.forecastPointId,
              forecastSourceKind: week.forecastSourceKind,
              fallbackUsed: week.fallbackUsed,
              basePriceKrwPerL: week.basePriceKrwPerL,
              priceDiffKrwPerL: week.priceDiffKrwPerL,
              diffRatio: week.diffRatio,
            })),
          },
        },
        select: {
          id: true,
        },
      });

      const result = await tx.fscResult.findUnique({
        where: {
          id: created.id,
        },
        include: {
          quarterSetting: true,
          weeks: {
            orderBy: {
              sequenceNo: 'asc',
            },
          },
        },
      });

      if (result === null) {
        throw new Error('FSC recompute finished without a readable result record.');
      }

      return result;
    },
    {
      maxWait: 60_000,
      timeout: 600_000,
    },
  );
}
