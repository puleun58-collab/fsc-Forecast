import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeOpinetDieselDailyHistory } from './fetch-daily-history';
import type { NormalizedDieselPriceRow } from './types';

const currentRows: NormalizedDieselPriceRow[] = [
  {
    date: '20260712',
    productCode: 'D047',
    productName: '자동차용경유',
    price: 1865.99,
    diff: -1.22,
    source: 'opinet-daily-average-price',
    fetchedAt: '2026-07-14T01:00:00.000Z',
  },
  {
    date: '20260713',
    productCode: 'D047',
    productName: '자동차용경유',
    price: 1864.81,
    diff: -1.18,
    source: 'opinet-daily-average-price',
    fetchedAt: '2026-07-14T01:00:00.000Z',
  },
];

const recentRows: NormalizedDieselPriceRow[] = [
  {
    date: '20260713',
    productCode: 'D047',
    productName: '자동차용경유',
    price: 1863.93,
    diff: -2.06,
    source: 'opinet-recent-daily-average-price',
    fetchedAt: '2026-07-14T01:05:00.000Z',
  },
];

test('mergeOpinetDieselDailyHistory prefers official average rows for overlapping dates', () => {
  const merged = mergeOpinetDieselDailyHistory(currentRows, recentRows);

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((row) => ({ date: row.date, price: row.price, diff: row.diff, source: row.source })),
    [
      { date: '20260712', price: 1865.99, diff: -1.22, source: 'opinet-daily-average-price' },
      { date: '20260713', price: 1864.81, diff: -1.18, source: 'opinet-daily-average-price' },
    ],
  );
});
