import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchPublishedOpinetQuarterlyDieselPrices } from './fetch-quarterly-price';

const PAGE_HTML = `
  <input name="all_chk_cnt" value="6">
  <input name="INIF_FLAG" value="2">
  <input name="h_maxYY" value="2026">
  <input name="h_maxQQ" value="20262">
  <input name="h_maxMM" value="202607">
  <input name="h_maxDD" value="20260720">
  <input name="h_maxWW" value="2026073">
  <input name="equal" value="2">
`;

test('fetches published Opinet quarterly diesel averages without reconstructing monthly values', async () => {
  // Given
  const requests: URLSearchParams[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      requests.push(new URLSearchParams(String(init.body)));
      return new Response('구분,자동차용경유\n2026Q1,1674.77\n2026Q2,1994.65\n');
    }

    return new Response(PAGE_HTML);
  };

  // When
  const rows = await fetchPublishedOpinetQuarterlyDieselPrices(
    { startYear: 2026, startQuarter: 1, endYear: 2026, endQuarter: 2 },
    fetchImpl,
  );

  // Then
  assert.deepEqual(rows.map((row) => ({ quarterKey: row.quarterKey, price: row.price })), [
    { quarterKey: '2026Q1', price: 1674.77 },
    { quarterKey: '2026Q2', price: 1994.65 },
  ]);
  assert.equal(requests[0]?.get('TERM'), 'Q');
  assert.equal(requests[0]?.get('STA_Q'), '1');
  assert.equal(requests[0]?.get('END_Q'), '2');
});
