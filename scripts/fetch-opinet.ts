import { config as loadEnv } from "dotenv";
import { fetchOpinetDieselDailyHistory } from "../src/lib/opinet/fetch-daily-history";
import { fetchLatestOpinetWeeklyDieselPrice } from "../src/lib/opinet/fetch-weekly-price";
import { saveDailySeries } from "../src/lib/opinet/save-daily-series";
import { saveWeeklySeries } from "../src/lib/opinet/save-weekly-series";

loadEnv({ path: ".env.local", override: true });
loadEnv();

async function main(): Promise<void> {
  const [dailyEntries, weeklyEntries] = await Promise.all([
    fetchOpinetDieselDailyHistory(),
    fetchLatestOpinetWeeklyDieselPrice(),
  ]);
  const [savedDailyEntries, savedWeeklyEntries] = await Promise.all([
    saveDailySeries(dailyEntries),
    saveWeeklySeries(weeklyEntries),
  ]);

  console.info(
    JSON.stringify(
      {
        daily: {
          fetchedCount: dailyEntries.length,
          savedCount: savedDailyEntries.length,
          outputPath: "data/oil-price-daily.json",
        },
        weekly: {
          fetchedCount: weeklyEntries.length,
          savedCount: savedWeeklyEntries.length,
          outputPath: "data/oil-price-weekly.json",
        },
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error("Failed to fetch and save Opinet diesel daily/weekly series.");
  console.error(error);
  process.exitCode = 1;
});