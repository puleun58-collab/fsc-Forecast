import './load-env';

import {
  persistOpinetPublishedPrices,
  readPersistedMonthlySeries,
  readPersistedQuarterlySeries,
} from '../src/lib/opinet/published-price-store';
import { readMonthlySeries } from '../src/lib/opinet/save-monthly-series';
import { readQuarterlySeries } from '../src/lib/opinet/save-quarterly-series';

async function main(): Promise<void> {
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
