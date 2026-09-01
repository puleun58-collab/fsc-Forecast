import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEstimatedFscRate, ESTIMATED_FSC_RATE_SCALE } from './estimated-fsc-rate';

test('estimated FSC rate multiplies the diff ratio by the oil weight rate', () => {
  assert.equal(ESTIMATED_FSC_RATE_SCALE, 6);
  assert.equal(
    calculateEstimatedFscRate({ diffRatio: '0.326909', oilWeightRate: '0.3000' }),
    '0.098073',
  );
  assert.equal(
    calculateEstimatedFscRate({ diffRatio: '0.234247', oilWeightRate: '0.3000' }),
    '0.070274',
  );
});

test('estimated FSC rate keeps the sign of a falling quarter average', () => {
  assert.equal(
    calculateEstimatedFscRate({ diffRatio: '-0.100000', oilWeightRate: '0.3000' }),
    '-0.030000',
  );
  assert.equal(
    calculateEstimatedFscRate({ diffRatio: '-0.326909', oilWeightRate: '0.3000' }),
    '-0.098073',
  );
});

test('estimated FSC rate is zero when the quarter average matches the base price', () => {
  assert.equal(calculateEstimatedFscRate({ diffRatio: '0.000000', oilWeightRate: '0.3000' }), '0.000000');
  assert.equal(calculateEstimatedFscRate({ diffRatio: '0.326909', oilWeightRate: '0.0000' }), '0.000000');
});

test('estimated FSC rate rounds half-up at the sixth decimal in both directions', () => {
  // 0.0000015 × 1 은 정확히 절반 지점이므로 절대값이 커지는 쪽으로 올림한다.
  assert.equal(calculateEstimatedFscRate({ diffRatio: '0.0000015', oilWeightRate: '1' }), '0.000002');
  assert.equal(calculateEstimatedFscRate({ diffRatio: '-0.0000015', oilWeightRate: '1' }), '-0.000002');
  assert.equal(calculateEstimatedFscRate({ diffRatio: '0.0000014', oilWeightRate: '1' }), '0.000001');
  // 십진 곱을 그대로 유지하므로 부동소수 오차로 자리가 밀리지 않는다.
  assert.equal(calculateEstimatedFscRate({ diffRatio: '0.100005', oilWeightRate: '0.3000' }), '0.030002');
});

test('estimated FSC rate accepts numeric inputs and rejects malformed values', () => {
  assert.equal(calculateEstimatedFscRate({ diffRatio: 0.234247, oilWeightRate: 0.3 }), '0.070274');
  assert.equal(calculateEstimatedFscRate({ diffRatio: 5e-7, oilWeightRate: 1 }), '0.000001');
  assert.throws(
    () => calculateEstimatedFscRate({ diffRatio: 'invalid', oilWeightRate: '0.3000' }),
    /diffRatio must be a finite decimal value/,
  );
  assert.throws(
    () => calculateEstimatedFscRate({ diffRatio: '0.3', oilWeightRate: Number.NaN }),
    /oilWeightRate must be a finite decimal value/,
  );
});
