import { config as loadEnv } from "dotenv";

import { db } from "../src/lib/db";
import { runOpinetIngest } from "../src/lib/ingest/run-opinet-ingest";

loadEnv({ path: ".env.local", override: true });
loadEnv();

async function main(): Promise<void> {
  const result = await runOpinetIngest({
    triggerKind: "manual",
    requestedByRuntime: "scripts/run-opinet-ingest",
    metadata: {
      invokedBy: "scripts/run-opinet-ingest.ts",
    },
  });

  console.info(
    JSON.stringify(
      {
        ingestRunId: result.ingestRun.id,
        ingestStatus: result.ingestRun.status,
        fetchedRowCount: result.fetchedRows.length,
        reconcile: {
          processedRowCount: result.reconcile.processedRowCount,
          createdRevisionCount: result.reconcile.createdRevisionCount,
          supersededRevisionCount: result.reconcile.supersededRevisionCount,
          unchangedRowCount: result.reconcile.unchangedRowCount,
          currentRowCount: result.reconcile.currentRowCount,
        },
        snapshot: {
          snapshotId: result.snapshot.snapshotId,
          currentRowCount: result.snapshot.currentRowCount,
          currentTruthCutoffAt: result.snapshot.currentTruthCutoffAt,
        },
        cacheRefresh: result.cacheRefresh,
        forecast: result.forecast,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error("Failed to run the DB-backed Opinet ingest pipeline.");
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
