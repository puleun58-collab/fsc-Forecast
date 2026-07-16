import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePublicConfirmedLatestDateFromRows } from './resolve-public-confirmed-date';

function createRow(date: string, source: string | null) {
  return {
    priceDate: new Date(`${date}T00:00:00.000Z`),
    sourcePayload: source === null ? null : { source },
  };
}

test('confirmed latest date uses the last date shared by avgAllPrice and recent API coverage', () => {
  const result = resolvePublicConfirmedLatestDateFromRows([
    createRow('2026-07-16', 'opinet-daily-average-price'),
    createRow('2026-07-15', 'opinet-daily-average-price'),
    createRow('2026-07-15', 'opinet-recent-daily-average-price'),
    createRow('2026-07-14', 'opinet-recent-daily-average-price'),
  ]);

  assert.equal(result?.toISOString(), '2026-07-15T00:00:00.000Z');
});

test('confirmed latest date falls back to the only available source when one source is missing', () => {
  const result = resolvePublicConfirmedLatestDateFromRows([
    createRow('2026-07-14', 'opinet-daily-average-price'),
    createRow('2026-07-13', 'opinet-daily-average-price'),
    createRow('2026-07-12', null),
  ]);

  assert.equal(result?.toISOString(), '2026-07-14T00:00:00.000Z');
});
