import { config as loadEnv } from "dotenv";

import { db } from "../src/lib/db";
import { externalIndicatorCodes } from "../src/lib/external-indicators/catalog";
import { fredIndicatorProvider } from "../src/lib/external-indicators/fred-provider";
import { runIndicatorSync } from "../src/lib/external-indicators/run-indicator-sync";

loadEnv({ path: ".env.local", override: true });
loadEnv();

async function main(): Promise<void> {
  const providerResult = await fredIndicatorProvider.fetchHistory({
    indicatorCodes: externalIndicatorCodes,
  });
  const syncResult = await runIndicatorSync({ providerResult });

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
