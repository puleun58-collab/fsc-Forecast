import "./load-env";

import { db } from "../src/lib/db";
import { runFscResultRecompute } from "../src/lib/fsc/run-fsc-result-recompute";
import { calculateEstimatedFscRate } from "../src/lib/fsc/estimated-fsc-rate";
import { ensureHistoricalQuarterSetting } from "../src/lib/quarter/ensure-historical-quarter";

function parseQuarterArgument(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer, received '${value ?? ""}'.`);
  }

  return parsed;
}

async function main(): Promise<void> {
  const targetYear = parseQuarterArgument(process.argv[2], "year");
  const targetQuarter = parseQuarterArgument(process.argv[3], "quarter");
  const quarterSetting = await ensureHistoricalQuarterSetting({ targetYear, targetQuarter });
  const result = await runFscResultRecompute({ quarterSettingId: quarterSetting.id });

  console.info(
    JSON.stringify(
      {
        quarterSettingId: quarterSetting.id,
        targetYear: result.targetYear,
        targetQuarter: result.targetQuarter,
        fscResultId: result.id,
        actualWeekCount: result.actualWeekCount,
        forecastWeekCount: result.forecastWeekCount,
        quarterAverageKrwPerL: result.quarterAverageKrwPerL.toFixed(3),
        basePriceKrwPerL: result.basePriceKrwPerL.toFixed(3),
        diffRatio: result.diffRatio.toFixed(6),
        fscLowRate: result.fscLowRate.toFixed(4),
        estimatedFscRate: calculateEstimatedFscRate({
          diffRatio: result.diffRatio.toFixed(6),
          oilWeightRate: result.fscLowRate.toFixed(4),
        }),
        weeks: result.weeks.map((week) => ({
          sequenceNo: week.sequenceNo,
          weekStartDate: week.weekStartDate.toISOString().slice(0, 10),
          weekEndDate: week.weekEndDate.toISOString().slice(0, 10),
          priceKind: week.priceKind,
          priceKrwPerL: week.priceKrwPerL?.toFixed(3) ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

void main()
  .catch((error: unknown) => {
    console.error("Failed to backfill the quarter FSC result.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
