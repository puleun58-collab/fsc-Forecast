import assert from 'node:assert/strict';
import test from 'node:test';

import { readFscReliabilityTrail } from './reliability-trail';

test('reliability trail exposes the full guardrail record for diagnostics', () => {
  const trail = readFscReliabilityTrail({
    reliability: {
      baseGrade: 'A',
      finalGrade: 'C',
      adjustmentReasons: ['recent_4w_error_worsening', 'long_window_instability', 7],
      recent13wWeeklyPriceMape: '1.474000',
      recent13wWeeklyPriceMae: '32.510',
      recent26wWeeklyPriceMae: '26.742',
      recent4wErrorTrend: 'worsening',
      dataFreshnessStatus: 'fresh',
    },
  });

  assert.equal(trail.baseGrade, 'A');
  assert.equal(trail.finalGrade, 'C');
  assert.deepEqual(trail.adjustmentReasons, ['recent_4w_error_worsening', 'long_window_instability']);
  assert.equal(trail.recent13wWeeklyPriceMape, '1.474000');
  assert.equal(trail.recent26wWeeklyPriceMae, '26.742');
  assert.equal(trail.recent4wErrorTrend, 'worsening');
  assert.equal(trail.dataFreshnessStatus, 'fresh');
});

test('reliability trail stays empty for payloads without a reliability record', () => {
  for (const payload of [null, undefined, {}, { reliability: null }, { reliability: 'A' }]) {
    const trail = readFscReliabilityTrail(payload);

    assert.equal(trail.baseGrade, null);
    assert.equal(trail.finalGrade, null);
    assert.deepEqual(trail.adjustmentReasons, []);
  }
});
