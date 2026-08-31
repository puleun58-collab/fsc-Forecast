import assert from 'node:assert/strict';
import test from 'node:test';

import { parseQuarterSelection, resolveSelectedQuarter } from './quarter-selection';

const QUARTERS = [
  { id: 'q3', targetYear: 2026, targetQuarter: 3 },
  { id: 'q2', targetYear: 2026, targetQuarter: 2 },
  { id: 'q1', targetYear: 2026, targetQuarter: 1 },
];
const ACTIVE = QUARTERS[0];

test('quarter selection is parsed only from a valid year and quarter pair', () => {
  assert.deepEqual(parseQuarterSelection({ year: '2026', quarter: '1' }), {
    targetYear: 2026,
    targetQuarter: 1,
  });
  assert.deepEqual(parseQuarterSelection({ year: ['2026'], quarter: ['2'] }), {
    targetYear: 2026,
    targetQuarter: 2,
  });
  assert.equal(parseQuarterSelection(undefined), null);
  assert.equal(parseQuarterSelection({ year: '2026' }), null);
  assert.equal(parseQuarterSelection({ quarter: '2' }), null);
  assert.equal(parseQuarterSelection({ year: '2026', quarter: '0' }), null);
  assert.equal(parseQuarterSelection({ year: '2026', quarter: '5' }), null);
  assert.equal(parseQuarterSelection({ year: 'abc', quarter: '2' }), null);
});

test('past quarters resolve to their own setting without changing the active quarter', () => {
  assert.equal(resolveSelectedQuarter(QUARTERS, { targetYear: 2026, targetQuarter: 1 }, ACTIVE).id, 'q1');
  assert.equal(resolveSelectedQuarter(QUARTERS, { targetYear: 2026, targetQuarter: 2 }, ACTIVE).id, 'q2');
  assert.equal(resolveSelectedQuarter(QUARTERS, { targetYear: 2026, targetQuarter: 3 }, ACTIVE).id, 'q3');
});

test('missing or unknown selections fall back to the active quarter', () => {
  assert.equal(resolveSelectedQuarter(QUARTERS, null, ACTIVE).id, 'q3');
  assert.equal(resolveSelectedQuarter(QUARTERS, { targetYear: 2025, targetQuarter: 4 }, ACTIVE).id, 'q3');
  assert.equal(resolveSelectedQuarter([], { targetYear: 2026, targetQuarter: 1 }, ACTIVE).id, 'q3');
});
