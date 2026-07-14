import { config as loadEnv } from "dotenv";

import { db } from "../src/lib/db";
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
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error("Failed to sync external indicator history.");
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
