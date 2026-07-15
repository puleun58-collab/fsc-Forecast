import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublicMarketSignals,
  buildPublicMarketSummaryText,
  calculateDirection,
  calculatePercentChange,
} from './market-signals';

test('public market signals expose only dubai and usd-krw from broader indicator input', () => {
  const signals = buildPublicMarketSignals([
    {
      indicatorCode: 'dubai',
      rows: [
        { observedAt: new Date('2026-07-14T00:00:00.000Z'), createdAt: new Date('2026-07-15T00:00:00.000Z'), value: 95 },
        { observedAt: new Date('2026-06-14T00:00:00.000Z'), createdAt: new Date('2026-06-15T00:00:00.000Z'), value: 100 },
      ],

    },
    {
      indicatorCode: 'brent',
      rows: [
        { observedAt: new Date('2026-07-14T00:00:00.000Z'), createdAt: new Date('2026-07-15T00:00:00.000Z'), value: 80 },
        { observedAt: new Date('2026-07-13T00:00:00.000Z'), createdAt: new Date('2026-07-14T00:00:00.000Z'), value: 79 },
      ],

    },
    {
      indicatorCode: 'wti',
      rows: [
        { observedAt: new Date('2026-07-14T00:00:00.000Z'), createdAt: new Date('2026-07-15T00:00:00.000Z'), value: 78 },
        { observedAt: new Date('2026-07-13T00:00:00.000Z'), createdAt: new Date('2026-07-14T00:00:00.000Z'), value: 77 },
      ],

    },
    {
      indicatorCode: 'usd-krw',
      rows: [
        { observedAt: new Date('2026-07-10T00:00:00.000Z'), createdAt: new Date('2026-07-15T00:00:00.000Z'), value: 1380 },
        { observedAt: new Date('2026-07-09T00:00:00.000Z'), createdAt: new Date('2026-07-14T00:00:00.000Z'), value: 1390 },
      ],

    },
  ]);

  assert.deepEqual(
    signals.map((signal) => signal.indicatorCode),
    ['dubai', 'usd-krw'],
  );
  assert.match(buildPublicMarketSummaryText(signals), /하방 요인|상쇄/);
  assert.equal(signals[0]?.observedAt, '2026-07-14T00:00:00.000Z');
  assert.equal(signals[0]?.collectedAt, '2026-07-15T00:00:00.000Z');
  assert.equal(signals[1]?.observedAt, '2026-07-10T00:00:00.000Z');
  assert.equal(signals[1]?.collectedAt, '2026-07-15T00:00:00.000Z');
});

test('market signal helpers calculate percent change and direction', () => {
  assert.equal(calculatePercentChange(100, 98)?.toFixed(2), '2.04');
  assert.equal(calculateDirection(2.04), 'up');
  assert.equal(calculatePercentChange(95, 100)?.toFixed(2), '-5.00');
  assert.equal(calculateDirection(-5), 'down');
  assert.equal(calculatePercentChange(null, 100), null);
  assert.equal(calculateDirection(null), 'flat');
});
