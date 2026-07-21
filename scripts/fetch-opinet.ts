import { config as loadEnv } from "dotenv";
import { refreshOpinetSeriesCache } from "../src/lib/opinet/refresh-series-cache";


loadEnv({ path: ".env.local", override: true });
loadEnv();

async function main(): Promise<void> {
  const summary = await refreshOpinetSeriesCache();

  console.info(
    JSON.stringify(
      {
        daily: {
          ...summary.daily,
          outputPath: 'data/oil-price-daily.json',
        },
        weekly: {
          ...summary.weekly,
          outputPath: 'data/oil-price-weekly.json',
        },
        monthly: {
          ...summary.monthly,
          outputPath: 'data/oil-price-monthly.json',
        },
        quarterly: {
          ...summary.quarterly,
          outputPath: 'data/oil-price-quarterly.json',
        },
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error("Failed to fetch and save Opinet diesel daily/weekly/monthly/quarterly series.");
  console.error(error);
  process.exitCode = 1;
});
