import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateBaselineComparison } from './baseline-comparison';

test('baseline comparison applies the same formula to daily weekly and quarter prices', () => {
  const basePrice = 1500;
  const daily = calculateBaselineComparison(1844.94, basePrice);
  const weekly = calculateBaselineComparison('1845.23', basePrice);
  const quarter = calculateBaselineComparison('1845.24', basePrice);

  assert.equal(daily?.ratio.toFixed(6), '0.229960');
  assert.equal(weekly?.ratio.toFixed(6), '0.230153');
  assert.equal(quarter?.ratio.toFixed(6), '0.230160');
  assert.equal(daily?.direction, 'up');
  assert.equal(weekly?.direction, 'up');
  assert.equal(quarter?.direction, 'up');
});

test('baseline comparison fails closed for missing or invalid prices', () => {
  assert.equal(calculateBaselineComparison(null, 1500), null);
  assert.equal(calculateBaselineComparison(1845, 0), null);
  assert.equal(calculateBaselineComparison('invalid', 1500), null);
});
