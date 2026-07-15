import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateRecentAverage,
  formatCompactDateRange,
  formatDotDate,
  formatDotDateTime,
  formatPriceNumber,
  formatPriceText,
  formatQuarterLabel,
  formatRatioPercentText,
  formatShortMonthLabel,
  getDirectionalChangeDisplay,
} from './display-format';

test('formatPrice helpers add separators and units', () => {
  assert.equal(formatPriceNumber(1994.56), '1,994.56');
  assert.equal(formatPriceText('1979.31'), '1,979.31원/L');
  assert.equal(formatRatioPercentText('0.245102'), '24.51%');
});

test('date helpers format dot notation for dates and timestamps', () => {
  assert.equal(formatDotDate('2026-07-13'), '2026.07.13');
  assert.equal(formatDotDateTime('2026-07-13T02:07:00.000Z'), '2026.07.13 11:07 KST');
  assert.equal(formatCompactDateRange('2026-07-01', '2026-07-13'), '2026.07.01–07.13');
});

test('quarter and month labels are shortened for UI copy', () => {
  assert.equal(formatQuarterLabel(2026, 2), '2026년 2분기');
  assert.equal(formatShortMonthLabel('2026년04월'), '4월');
});

test('directional change helper includes icon, text, and compact amounts', () => {
  assert.deepEqual(getDirectionalChangeDisplay('down', -1.18, -0.06), {
    icon: '▼',
    label: '하락',
    amountText: '1.18원',
    percentText: '-0.06%',
  });

  assert.deepEqual(getDirectionalChangeDisplay('up', 2.5, 0.13), {
    icon: '▲',
    label: '상승',
    amountText: '2.50원',
    percentText: '+0.13%',
  });
});

test('recent average uses the latest available points up to the requested count', () => {
  assert.equal(
    calculateRecentAverage(
      [
        { priceKrwPerL: 10 },
        { priceKrwPerL: 20 },
        { priceKrwPerL: 30 },
        { priceKrwPerL: 40 },
      ],
      3,
    ),
    30,
  );
  assert.equal(calculateRecentAverage([], 7), null);
});
