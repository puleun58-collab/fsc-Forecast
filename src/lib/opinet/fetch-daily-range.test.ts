import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchOpinetDieselDailyRange, parseDailyStatsLabel } from './fetch-daily-range';

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

const NOW = new Date('2026-08-31T00:00:00.000Z');

interface StubbedFetch {
  readonly fetchImpl: typeof fetch;
  readonly requests: URLSearchParams[];
}

function createStubbedFetch(csvByChunkIndex: readonly string[]): StubbedFetch {
  const requests: URLSearchParams[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      const chunkIndex = requests.length;
      requests.push(new URLSearchParams(String(init.body)));
      const csvText = csvByChunkIndex[chunkIndex];

      if (csvText === undefined) {
        throw new Error(`Unexpected Opinet stats CSV request #${chunkIndex}.`);
      }

      return new Response(csvText);
    }

    return new Response(PAGE_HTML);
  };

  return { fetchImpl, requests };
}

test('parses the live Korean daily label and the tolerated ISO label', () => {
  // Given / When / Then
  assert.deepEqual(parseDailyStatsLabel('2026년06월01일'), { year: 2026, month: 6, day: 1 });
  assert.deepEqual(parseDailyStatsLabel(' 2026년 6월 30일 '), { year: 2026, month: 6, day: 30 });
  assert.deepEqual(parseDailyStatsLabel('2026-06-01'), { year: 2026, month: 6, day: 1 });
});

test('rejects labels that are not daily periods or not real dates', () => {
  // Given / When / Then
  assert.throws(() => parseDailyStatsLabel('2026년06월'), /Unexpected Opinet daily stats label/);
  assert.throws(() => parseDailyStatsLabel('2026Q2'), /Unexpected Opinet daily stats label/);
  assert.throws(() => parseDailyStatsLabel('2026-02-30'), /not a real calendar date/);
});

test('issues one daily stats request per calendar month with clipped day bounds', async () => {
  // Given
  const { fetchImpl, requests } = createStubbedFetch([
    '구분,price\n2026-05-30,1900.00\n2026-05-31,1901.00\n',
    '구분,price\n2026-06-01,1902.00\n2026-06-30,1903.00\n',
    '구분,price\n2026-07-01,1904.00\n2026-07-02,1905.00\n',
  ]);

  // When
  const rows = await fetchOpinetDieselDailyRange(
    { from: '2026-05-30', to: '2026-07-02', now: NOW },
    fetchImpl,
  );

  // Then
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map((request) => ({
      term: request.get('TERM'),
      startYear: request.get('STA_Y'),
      startMonth: request.get('STA_M'),
      startDay: request.get('STA_D'),
      endYear: request.get('END_Y'),
      endMonth: request.get('END_M'),
      endDay: request.get('END_D'),
    })),
    [
      {
        term: 'D',
        startYear: '2026',
        startMonth: '05',
        startDay: '30',
        endYear: '2026',
        endMonth: '05',
        endDay: '31',
      },
      {
        term: 'D',
        startYear: '2026',
        startMonth: '06',
        startDay: '01',
        endYear: '2026',
        endMonth: '06',
        endDay: '30',
      },
      {
        term: 'D',
        startYear: '2026',
        startMonth: '07',
        startDay: '01',
        endYear: '2026',
        endMonth: '07',
        endDay: '02',
      },
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.date),
    ['20260530', '20260531', '20260601', '20260630', '20260701', '20260702'],
  );
  assert.equal(requests[0]?.get('OIL_CD_D047'), 'Y');
  assert.equal(requests[0]?.get('sta_dt'), '');
  assert.equal(requests[0]?.get('end_dt'), '');
});

test('normalizes daily rows with rounded day-over-day diffs and a distinct source', async () => {
  // Given
  const { fetchImpl } = createStubbedFetch([
    '구분,price\n2026-06-01,2005.28\n2026-06-02,2007.11\n2026-06-03,2004.05\n',
  ]);

  // When
  const rows = await fetchOpinetDieselDailyRange(
    { from: '2026-06-01', to: '2026-06-03', now: NOW },
    fetchImpl,
  );

  // Then
  assert.deepEqual(rows, [
    {
      date: '20260601',
      productCode: 'D047',
      productName: '자동차용경유',
      price: 2005.28,
      diff: 0,
      source: 'opinet-stats-daily',
      fetchedAt: '2026-08-31T00:00:00.000Z',
    },
    {
      date: '20260602',
      productCode: 'D047',
      productName: '자동차용경유',
      price: 2007.11,
      diff: 1.83,
      source: 'opinet-stats-daily',
      fetchedAt: '2026-08-31T00:00:00.000Z',
    },
    {
      date: '20260603',
      productCode: 'D047',
      productName: '자동차용경유',
      price: 2004.05,
      diff: -3.06,
      source: 'opinet-stats-daily',
      fetchedAt: '2026-08-31T00:00:00.000Z',
    },
  ]);
});

test('collapses duplicate dates across chunks with the later chunk winning', async () => {
  // Given
  const { fetchImpl } = createStubbedFetch([
    '구분,price\n2026-06-30,1000.00\n',
    '구분,price\n2026-06-30,1234.50\n2026-07-01,1235.00\n',
  ]);

  // When
  const rows = await fetchOpinetDieselDailyRange(
    { from: '2026-06-30', to: '2026-07-01', now: NOW },
    fetchImpl,
  );

  // Then
  assert.deepEqual(
    rows.map((row) => ({ date: row.date, price: row.price, diff: row.diff })),
    [
      { date: '20260630', price: 1234.5, diff: 0 },
      { date: '20260701', price: 1235, diff: 0.5 },
    ],
  );
});

test('drops rows Opinet returns outside the requested range', async () => {
  // Given
  const { fetchImpl } = createStubbedFetch([
    '구분,price\n2026-06-01,1900.00\n2026-06-15,1910.00\n2026-06-30,1920.00\n',
  ]);

  // When
  const rows = await fetchOpinetDieselDailyRange(
    { from: '2026-06-10', to: '2026-06-20', now: NOW },
    fetchImpl,
  );

  // Then
  assert.deepEqual(
    rows.map((row) => row.date),
    ['20260615'],
  );
});

test('rejects invalid ranges before touching the network', async () => {
  // Given
  const { fetchImpl, requests } = createStubbedFetch([]);

  // When / Then
  await assert.rejects(
    () => fetchOpinetDieselDailyRange({ from: '2026-06-30', to: '2026-06-01' }, fetchImpl),
    /must not be after its end/,
  );
  await assert.rejects(
    () => fetchOpinetDieselDailyRange({ from: '2026-6-1', to: '2026-06-30' }, fetchImpl),
    /must be YYYY-MM-DD/,
  );
  await assert.rejects(
    () => fetchOpinetDieselDailyRange({ from: '2026-02-30', to: '2026-06-30' }, fetchImpl),
    /not a real calendar date/,
  );
  assert.equal(requests.length, 0);
});

test('fails loudly when a CSV label is not a daily period', async () => {
  // Given
  const { fetchImpl } = createStubbedFetch(['구분,price\n2026Q2,1994.65\n']);

  // When / Then
  await assert.rejects(
    () => fetchOpinetDieselDailyRange({ from: '2026-06-01', to: '2026-06-30' }, fetchImpl),
    /Unexpected Opinet daily stats label/,
  );
});
