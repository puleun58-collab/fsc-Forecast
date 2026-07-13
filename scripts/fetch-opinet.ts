import { config as loadEnv } from "dotenv";
import { fetchOpinetDieselDailyHistory } from "../src/lib/opinet/fetch-daily-history";
import { fetchPublishedOpinetMonthlyDieselPrices } from "../src/lib/opinet/fetch-monthly-price";
import { fetchPublishedOpinetWeeklyDieselPrices } from "../src/lib/opinet/fetch-weekly-price";
import { saveDailySeries } from "../src/lib/opinet/save-daily-series";
import { saveMonthlySeries } from "../src/lib/opinet/save-monthly-series";
import { saveWeeklySeries } from "../src/lib/opinet/save-weekly-series";

loadEnv({ path: ".env.local", override: true });
loadEnv();

async function main(): Promise<void> {
  const [dailyEntries, weeklyEntries, monthlyEntries] = await Promise.all([
    fetchOpinetDieselDailyHistory(),
    fetchPublishedOpinetWeeklyDieselPrices(),
    fetchPublishedOpinetMonthlyDieselPrices(),
  ]);
  const [savedDailyEntries, savedWeeklyEntries, savedMonthlyEntries] = await Promise.all([
    saveDailySeries(dailyEntries),
    saveWeeklySeries(weeklyEntries),
    saveMonthlySeries(monthlyEntries),
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
        monthly: {
          fetchedCount: monthlyEntries.length,
          savedCount: savedMonthlyEntries.length,
          outputPath: "data/oil-price-monthly.json",
        },
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error("Failed to fetch and save Opinet diesel daily/weekly/monthly series.");
  console.error(error);
  process.exitCode = 1;
});