import { config as loadEnv } from "dotenv";

import { externalIndicatorCodes } from "../src/lib/external-indicators/catalog";
import { db } from "../src/lib/db";
import { loadLatestIndicatorStates } from "../src/lib/external-indicators/latest-indicator-states";
import { syncExternalIndicators } from "../src/lib/external-indicators/sync-external-indicators";

loadEnv({ path: ".env.local", override: true });
loadEnv();

async function main(): Promise<void> {
  const syncResult = await syncExternalIndicators();

  console.info(
    JSON.stringify(
      {
        providerKey: syncResult.providerKey,
        acceptedPointCount: syncResult.acceptedPointCount,
        persistedCount: syncResult.persistedCount,
        createdCount: syncResult.createdCount,
        updatedCount: syncResult.updatedCount,
        latestStates: syncResult.latestStates.map((state) => ({
          indicatorCode: state.indicatorCode,
          latestObservationDate: state.observedAt.toISOString(),
          collectedAt: state.collectedAt.toISOString(),
          value: state.value,
        })),
      },
      null,
      2,
    ),
  );
}

void main().catch(async (error: unknown) => {
  const latestStates = await loadLatestIndicatorStates({ indicatorCodes: externalIndicatorCodes });
  console.error("Failed to sync external indicator history.");
  console.error(
    JSON.stringify(
      {
        errorSummary: error instanceof Error ? error.message : String(error),
        latestStates: latestStates.map((state) => ({
          indicatorCode: state.indicatorCode,
          lastSuccessfulObservationDate: state.observedAt.toISOString(),
          lastSuccessfulCollectedAt: state.collectedAt.toISOString(),
          value: state.value,
        })),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
