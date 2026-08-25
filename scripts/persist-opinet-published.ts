import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: true });
loadEnv();

async function main(): Promise<void> {
  const [
    { persistOpinetPublishedPrices, readPersistedMonthlySeries, readPersistedQuarterlySeries },
    { readMonthlySeries },
    { readQuarterlySeries },
  ] = await Promise.all([
    import('../src/lib/opinet/published-price-store'),
    import('../src/lib/opinet/save-monthly-series'),
    import('../src/lib/opinet/save-quarterly-series'),
  ]);
  const [monthlyEntries, quarterlyEntries] = await Promise.all([
    readMonthlySeries(),
    readQuarterlySeries(),
  ]);

  await persistOpinetPublishedPrices({ monthlyEntries, quarterlyEntries });
  const [persistedMonthly, persistedQuarterly] = await Promise.all([
    readPersistedMonthlySeries(),
    readPersistedQuarterlySeries(),
  ]);
  const latestMonthly = persistedMonthly[persistedMonthly.length - 1] ?? null;

  console.log(JSON.stringify({
    status: 'succeeded',
    monthlyCount: persistedMonthly.length,
    quarterlyCount: persistedQuarterly.length,
    latestMonthly: latestMonthly ? {
      monthKey: latestMonthly.monthKey,
      price: latestMonthly.price,
      source: latestMonthly.source,
    } : null,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
