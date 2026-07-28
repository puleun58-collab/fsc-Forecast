import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ecbExchangeRateProvider,
  parseEcbDailyUsdKrwXml,
} from './ecb-exchange-rate-provider';
import { parseOpinetDubaiDailyHtml } from './opinet-dubai-provider';

const OPINET_FIXTURE = `
<table>
  <tbody id="tbody1"><tr><td>26년07월17일</td><td>720.12</td></tr></tbody>
  <tbody id="tbody2">
    <tr><td>26년07월16일</td><td>75.79</td><td>84.23</td><td>78.95</td></tr>
    <tr><td>26년07월17일</td><td>76.90</td><td>88.10</td><td>82.49</td></tr>
    <tr><td>26년07월18일</td><td>.</td><td>88.10</td><td>82.49</td></tr>
    <tr><td>26년07월19일</td><td>0</td><td>88.10</td><td>82.49</td></tr>
    <tr><td>invalid</td><td>80.00</td><td>88.10</td><td>82.49</td></tr>
  </tbody>
</table>`;

test('Opinet Dubai parser reads only valid daily USD/BBL observations', () => {
  const points = parseOpinetDubaiDailyHtml(OPINET_FIXTURE, {
    indicatorCodes: ['dubai'],
    observedAtOrAfter: new Date('2026-07-01T00:00:00.000Z'),
    observedAtOrBefore: new Date('2026-07-20T00:00:00.000Z'),
  });

  assert.deepEqual(
    points.map((point) => ({ date: point.observedAt.toISOString(), value: point.value })),
    [
      { date: '2026-07-16T00:00:00.000Z', value: 75.79 },
      { date: '2026-07-17T00:00:00.000Z', value: 76.9 },
    ],
  );
  assert.deepEqual(points[1]?.sourcePayload, {
    provider: 'opinet-dubai-daily',
    sourceUrl: 'https://www.opinet.co.kr/glopcoilSelect.do',
    instrument: 'Dubai spot estimate',
    frequency: 'daily',
    unit: 'usd_per_barrel',
    valueBasis: 'dubai_spot_estimate',
    date: '26년07월17일',
    rawValue: '76.90',
  });
});

test('Opinet Dubai parser rejects conflicting duplicate dates', () => {
  const html = '<tbody id="tbody2"><tr><td>26년07월17일</td><td>76.90</td></tr><tr><td>26년07월17일</td><td>77.00</td></tr></tbody>';
  assert.throws(() => parseOpinetDubaiDailyHtml(html), /conflicting Dubai values/);
});

const ECB_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope>
  <Cube>
    <Cube time="2026-07-16">
      <Cube currency="USD" rate="1.1500"/>
      <Cube currency="KRW" rate="1713.275"/>
    </Cube>
    <Cube time="2026-07-17">
      <Cube currency="USD" rate="1.1400"/>
      <Cube currency="KRW" rate="1698.46"/>
    </Cube>
    <Cube time="2026-07-18">
      <Cube currency="USD" rate="invalid"/>
      <Cube currency="KRW" rate="1700"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

test('ECB parser derives valid daily USD/KRW cross-rates and respects the date window', () => {
  const points = parseEcbDailyUsdKrwXml(ECB_FIXTURE, {
    indicatorCodes: ['usd-krw'],
    observedAtOrAfter: new Date('2026-07-17T00:00:00.000Z'),
  });

  assert.deepEqual(
    points.map((point) => ({ date: point.observedAt.toISOString(), value: point.value })),
    [{ date: '2026-07-17T00:00:00.000Z', value: 1489.8772 }],
  );
  assert.deepEqual(points[0]?.sourcePayload, {
    provider: 'ecb-daily-reference-rates',
    sourceUrl: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
    seriesIds: {
      krwPerEur: 'EXR.D.KRW.EUR.SP00.A',
      usdPerEur: 'EXR.D.USD.EUR.SP00.A',
    },
    frequency: 'daily',
    unit: 'krw_per_usd',
    valueBasis: 'ecb_euro_reference_cross_rate',
    date: '2026-07-17',
    euroReferenceRates: {
      USD: 1.14,
      KRW: 1698.46,
    },
    calculation: 'KRW_per_EUR / USD_per_EUR',
  });
});

test('ECB daily provider fetches exchange rates only for USD/KRW', async () => {
  const requests: string[] = [];
  const result = await ecbExchangeRateProvider.fetchHistory({
    indicatorCodes: ['dubai', 'usd-krw'],
    fetchImpl: async (input) => {
      requests.push(String(input));
      return new Response(ECB_FIXTURE);
    },
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? '', /eurofxref-hist-90d\.xml/);
  assert.deepEqual(result.points.map((point) => point.value), [1489.8043, 1489.8772]);
  assert.equal(
    result.points[0]?.sourcePayload &&
      (result.points[0].sourcePayload as { frequency?: string }).frequency,
    'daily',
  );
});
