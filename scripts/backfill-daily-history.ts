import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv();

import { db } from "../src/lib/db";
import { createRecomputeSnapshot } from "../src/lib/ingest/create-recompute-snapshot";
import {
  recordFailedIngestRun,
  recordQueuedIngestRun,
  recordStartedIngestRun,
  recordSucceededIngestRun,
} from "../src/lib/ingest/record-ingest-run";
import { reconcileDailyPrices } from "../src/lib/ingest/reconcile-daily-prices";
import { OPINET_DATASET_KEY } from "../src/lib/ingest/types";
import { fetchOpinetDieselDailyRange } from "../src/lib/opinet/fetch-daily-range";

const REQUESTED_BY_RUNTIME = "scripts/backfill-daily-history";
const TRIGGER_REASON = "manual-historical-backfill";
const NEXT_STEPS =
  "Backfill only reconciled daily truth rows. The forecast pipeline and the FSC result recompute must be run after this backfill before any dashboard or FSC number is trusted.";
const USAGE = [
  "Usage:",
  "  node --env-file=.env.local --import tsx scripts/backfill-daily-history.ts --from=YYYY-MM-DD --to=YYYY-MM-DD",
  "  node --env-file=.env.local --import tsx scripts/backfill-daily-history.ts YYYY-MM-DD YYYY-MM-DD",
].join("\n");

interface BackfillRange {
  readonly from: string;
  readonly to: string;
}

function createUsageError(message: string): Error {
  return new Error(`${message}\n\n${USAGE}`);
}

function assertIsoDate(value: string, fieldName: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw createUsageError(`${fieldName} must be YYYY-MM-DD, received '${value}'.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw createUsageError(`${fieldName} is not a real calendar date: '${value}'.`);
  }
}

function parseRangeArguments(argv: readonly string[]): BackfillRange {
  const positionals: string[] = [];
  let from: string | undefined;
  let to: string | undefined;

  for (const argument of argv) {
    if (argument.startsWith("--from=")) {
      from = argument.slice("--from=".length).trim();
      continue;
    }

    if (argument.startsWith("--to=")) {
      to = argument.slice("--to=".length).trim();
      continue;
    }

    if (argument.startsWith("--")) {
      throw createUsageError(`Unknown option '${argument}'.`);
    }

    positionals.push(argument.trim());
  }

  from = from ?? positionals[0];
  to = to ?? positionals[1];

  if (!from || !to) {
    throw createUsageError("Both --from and --to are required.");
  }

  assertIsoDate(from, "--from");
  assertIsoDate(to, "--to");

  if (from > to) {
    throw createUsageError(`--from must not be after --to, received '${from}' to '${to}'.`);
  }

  return { from, to };
}

function toUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function listCalendarDates(range: BackfillRange): string[] {
  const dates: string[] = [];
  const cursor = toUtcDate(range.from);
  const last = toUtcDate(range.to);

  while (cursor.getTime() <= last.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

interface StoredRangeIntegrity {
  readonly rowCountInRange: number;
  readonly duplicateDateCount: number;
  readonly missingDates: string[];
  readonly minStoredPriceKrwPerL: number | null;
  readonly maxStoredPriceKrwPerL: number | null;
  readonly invalidPriceRowCount: number;
  readonly touchedRowCountOutsideRange: number;
}

async function inspectStoredRange(
  range: BackfillRange,
  ingestRunId: string,
): Promise<StoredRangeIntegrity> {
  const fromDate = toUtcDate(range.from);
  const toDate = toUtcDate(range.to);

  const storedRows = await db.dailyPriceCurrent.findMany({
    where: {
      datasetKey: OPINET_DATASET_KEY,
      priceDate: {
        gte: fromDate,
        lte: toDate,
      },
    },
    orderBy: {
      priceDate: "asc",
    },
    select: {
      priceDate: true,
      currentRevision: {
        select: {
          observedPriceKrwPerL: true,
        },
      },
    },
  });

  const groupedDates = await db.dailyPriceCurrent.groupBy({
    by: ["priceDate"],
    where: {
      datasetKey: OPINET_DATASET_KEY,
      priceDate: {
        gte: fromDate,
        lte: toDate,
      },
    },
    _count: {
      _all: true,
    },
  });

  const revisionsFromThisRun = await db.priceRevisionLog.findMany({
    where: {
      datasetKey: OPINET_DATASET_KEY,
      ingestRunId,
    },
    select: {
      priceDate: true,
    },
  });

  const storedDates = new Set(storedRows.map((row) => toIsoDate(row.priceDate)));
  const prices: number[] = [];
  let invalidPriceRowCount = 0;

  for (const row of storedRows) {
    const rawPrice: unknown = row.currentRevision.observedPriceKrwPerL;
    const numericPrice =
      rawPrice === null || rawPrice === undefined ? Number.NaN : Number(rawPrice);

    if (!Number.isFinite(numericPrice)) {
      invalidPriceRowCount += 1;
      continue;
    }

    prices.push(numericPrice);
  }

  return {
    rowCountInRange: storedRows.length,
    duplicateDateCount: groupedDates.filter((group) => group._count._all > 1).length,
    missingDates: listCalendarDates(range).filter((date) => !storedDates.has(date)),
    minStoredPriceKrwPerL: prices.length === 0 ? null : Math.min(...prices),
    maxStoredPriceKrwPerL: prices.length === 0 ? null : Math.max(...prices),
    invalidPriceRowCount,
    touchedRowCountOutsideRange: revisionsFromThisRun.filter((revision) => {
      const time = revision.priceDate.getTime();
      return time < fromDate.getTime() || time > toDate.getTime();
    }).length,
  };
}

async function main(): Promise<void> {
  const range = parseRangeArguments(process.argv.slice(2));
  const queuedRun = await recordQueuedIngestRun({
    triggerKind: "manual",
    requestedByRuntime: REQUESTED_BY_RUNTIME,
    sourceWindowStart: toUtcDate(range.from),
    sourceWindowEnd: toUtcDate(range.to),
    metadata: {
      backfillFrom: range.from,
      backfillTo: range.to,
      mode: "historical-daily-range",
    },
  });

  try {
    await recordStartedIngestRun(queuedRun.id, {
      stage: "fetching-opinet-daily-range",
      backfillFrom: range.from,
      backfillTo: range.to,
    });

    const rows = await fetchOpinetDieselDailyRange({ from: range.from, to: range.to });

    if (rows.length === 0) {
      throw new Error(
        `Opinet returned no daily diesel rows for ${range.from} to ${range.to}; refusing to reconcile an empty backfill.`,
      );
    }

    const { reconcile, snapshot } = await db.$transaction(
      async (tx) => {
        const reconcileResult = await reconcileDailyPrices({
          ingestRunId: queuedRun.id,
          rows,
          tx,
        });
        const snapshotResult = await createRecomputeSnapshot({
          triggeringIngestRunId: queuedRun.id,
          triggerReason: TRIGGER_REASON,
          metadata: {
            from: range.from,
            to: range.to,
            processedRowCount: reconcileResult.processedRowCount,
            createdRevisionCount: reconcileResult.createdRevisionCount,
            supersededRevisionCount: reconcileResult.supersededRevisionCount,
            unchangedRowCount: reconcileResult.unchangedRowCount,
          },
          tx,
        });

        return { reconcile: reconcileResult, snapshot: snapshotResult };
      },
      {
        maxWait: 15_000,
        timeout: 120_000,
      },
    );

    const integrity = await inspectStoredRange(range, queuedRun.id);

    await recordSucceededIngestRun(queuedRun.id, {
      stage: "completed",
      backfillFrom: range.from,
      backfillTo: range.to,
      fetchedRowCount: rows.length,
      reconcile: {
        processedRowCount: reconcile.processedRowCount,
        createdRevisionCount: reconcile.createdRevisionCount,
        supersededRevisionCount: reconcile.supersededRevisionCount,
        unchangedRowCount: reconcile.unchangedRowCount,
        currentRowCount: reconcile.currentRowCount,
      },
      recomputeSnapshot: {
        snapshotId: snapshot.snapshotId,
        currentRowCount: snapshot.currentRowCount,
        currentTruthCutoffAt: snapshot.currentTruthCutoffAt.toISOString(),
      },
      integrity: {
        rowCountInRange: integrity.rowCountInRange,
        duplicateDateCount: integrity.duplicateDateCount,
        missingDateCount: integrity.missingDates.length,
        invalidPriceRowCount: integrity.invalidPriceRowCount,
        touchedRowCountOutsideRange: integrity.touchedRowCountOutsideRange,
      },
    });

    console.info(
      JSON.stringify(
        {
          requestedRange: {
            from: range.from,
            to: range.to,
            calendarDayCount: listCalendarDates(range).length,
          },
          ingestRunId: queuedRun.id,
          fetchedRowCount: rows.length,
          fetchedFirstDate: rows[0]?.date ?? null,
          fetchedLastDate: rows[rows.length - 1]?.date ?? null,
          reconcile: {
            processedRowCount: reconcile.processedRowCount,
            createdRevisionCount: reconcile.createdRevisionCount,
            supersededRevisionCount: reconcile.supersededRevisionCount,
            unchangedRowCount: reconcile.unchangedRowCount,
            currentRowCount: reconcile.currentRowCount,
          },
          recomputeSnapshotId: snapshot.snapshotId,
          databaseVerification: {
            rowCountInRange: integrity.rowCountInRange,
            duplicateDateCount: integrity.duplicateDateCount,
            missingDates: integrity.missingDates,
            minStoredPriceKrwPerL: integrity.minStoredPriceKrwPerL,
            maxStoredPriceKrwPerL: integrity.maxStoredPriceKrwPerL,
            invalidPriceRowCount: integrity.invalidPriceRowCount,
            touchedRowCountOutsideRange: integrity.touchedRowCountOutsideRange,
          },
          nextSteps: NEXT_STEPS,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await recordFailedIngestRun(queuedRun.id, error, {
      stage: "failed",
      backfillFrom: range.from,
      backfillTo: range.to,
    });
    throw error;
  }
}

void main()
  .catch((error: unknown) => {
    console.error("Failed to backfill the Opinet daily price history.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
