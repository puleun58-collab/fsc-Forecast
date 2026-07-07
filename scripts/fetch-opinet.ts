import { config as loadEnv } from "dotenv";
import { fetchOpinetAverageDieselPrices } from "../src/lib/opinet/fetch-avg-price";
import { saveDailySeries } from "../src/lib/opinet/save-daily-series";

loadEnv({ path: ".env.local" });
loadEnv();
async function main(): Promise<void> {
  const dieselEntries = await fetchOpinetAverageDieselPrices();
  const savedEntries = await saveDailySeries(dieselEntries);

  console.info(
    JSON.stringify(
      {
        fetchedCount: dieselEntries.length,
        savedCount: savedEntries.length,
        outputPath: "data/oil-price-daily.json",
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error("Failed to fetch and save Opinet diesel daily series.");
  console.error(error);
  process.exitCode = 1;
});
