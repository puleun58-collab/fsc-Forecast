import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateScenarioFscValues, parseScenarioPrice } from './price-scenario';

test('scenario price parser accepts only positive finite values', () => {
  assert.equal(parseScenarioPrice('1650'), 1650);
  assert.equal(parseScenarioPrice('1650.25'), 1650.25);
  assert.equal(parseScenarioPrice(''), null);
  assert.equal(parseScenarioPrice('0'), null);
  assert.equal(parseScenarioPrice('-1'), null);
  assert.equal(parseScenarioPrice('invalid'), null);
});

test('scenario FSC values follow the existing fsc-v1 formula', () => {
  const result = calculateScenarioFscValues({
    scenarioPriceKrwPerL: 1650,
    quarterAverageKrwPerL: 1850.049,
  });

  assert.deepEqual(result, {
    priceDiffKrwPerL: 200.049,
    diffRatio: 0.121242,
  });
});
