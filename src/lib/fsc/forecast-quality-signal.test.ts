import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessForecastQuality,
  type AssessForecastQualityInput,
} from './forecast-quality-signal';

function input(overrides: Partial<AssessForecastQualityInput> = {}): AssessForecastQualityInput {
  return {
    adjustmentReasons: [],
    reliabilityGrade: 'B',
    reliabilitySampleCount: 13,
    reliabilityMinimumSampleCount: 13,
    recent4wErrorTrend: 'stable',
    dataFreshnessStatus: 'fresh',
    hasReliabilityRecord: true,
    ...overrides,
  };
}

test('a graded result without guardrail reasons is stable', () => {
  const assessment = assessForecastQuality(input());

  assert.equal(assessment.status, 'stable');
  assert.deepEqual(assessment.signals, []);
  assert.equal(assessment.dataNotice, null);
});

test('recorded model-quality guardrails raise attention', () => {
  const worsening = assessForecastQuality(
    input({ adjustmentReasons: ['recent_4w_error_worsening'], recent4wErrorTrend: 'worsening' }),
  );
  const longWindow = assessForecastQuality(input({ adjustmentReasons: ['long_window_instability'] }));
  const both = assessForecastQuality(
    input({ adjustmentReasons: ['recent_4w_error_worsening', 'long_window_caution'] }),
  );

  assert.equal(worsening.status, 'attention');
  assert.deepEqual(worsening.signals, ['recent_4w_error_worsening']);
  assert.equal(longWindow.status, 'attention');
  assert.deepEqual(longWindow.signals, ['long_window_instability']);
  assert.equal(both.status, 'attention');
  assert.deepEqual(both.signals, ['recent_4w_error_worsening', 'long_window_caution']);
});

test('data freshness problems are a notice, never a model-quality warning', () => {
  const delayed = assessForecastQuality(
    input({ adjustmentReasons: ['data_delayed'], dataFreshnessStatus: 'delayed' }),
  );
  const stale = assessForecastQuality(
    input({ adjustmentReasons: ['data_stale'], dataFreshnessStatus: 'stale' }),
  );

  assert.equal(delayed.status, 'stable');
  assert.deepEqual(delayed.signals, []);
  assert.equal(delayed.dataNotice, 'data_delayed');
  assert.equal(stale.status, 'stable');
  assert.equal(stale.dataNotice, 'data_stale');
});

test('insufficient samples or an unrated grade stay unrated instead of attention', () => {
  const fewSamples = assessForecastQuality(
    input({ reliabilitySampleCount: 8, adjustmentReasons: ['recent_4w_error_worsening'] }),
  );
  const unratedGrade = assessForecastQuality(
    input({ reliabilityGrade: 'U', adjustmentReasons: ['long_window_instability'] }),
  );
  const withoutRecord = assessForecastQuality(input({ hasReliabilityRecord: false }));

  assert.equal(fewSamples.status, 'unrated');
  assert.equal(unratedGrade.status, 'unrated');
  assert.equal(withoutRecord.status, 'unrated');
  assert.deepEqual(fewSamples.signals, ['recent_4w_error_worsening']);
});

test('unavailable data is surfaced as a notice on an unrated result', () => {
  const assessment = assessForecastQuality(
    input({
      adjustmentReasons: ['data_unavailable'],
      reliabilityGrade: 'U',
      dataFreshnessStatus: 'unavailable',
    }),
  );

  assert.equal(assessment.status, 'unrated');
  assert.equal(assessment.dataNotice, 'data_unavailable');
});
