import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StatusRail } from './dashboard-header';
import { mapReliabilityAdjustmentReason } from './dashboard-format';
import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function createFsc(overrides: Partial<FscDashboardResultSection> = {}): FscDashboardResultSection {
  return {
    dataFreshnessStatus: 'fresh',
    approvalStatus: 'approved',
    reliabilityGrade: 'C',
    baseReliabilityGrade: 'A',
    reliabilityAdjustmentReasons: ['recent_4w_error_worsening', 'long_window_instability'],
    reliabilitySampleCount: 18,
    reliabilityMinimumSampleCount: 13,
    recent13wWeeklyPriceMape: '1.534221',
    ...overrides,
  } as FscDashboardResultSection;
}

test('reliability chip discloses the base grade, final grade and adjustment reasons', () => {
  const markup = renderToStaticMarkup(createElement(StatusRail, { fsc: createFsc() }));

  assert.match(markup, /신뢰도 C · MAPE 1\.5%/);
  assert.match(markup, /최근 13주 MAPE.*1\.53%/);
  assert.match(markup, /기본 등급.*A/);
  assert.match(markup, /최종 등급.*C/);
  assert.match(markup, /최근 4주 예측 오차가 이전보다 악화되었습니다\./);
  assert.match(markup, /최근 26주 장기 성능이 최근 13주 대비 불안정합니다\./);
  assert.doesNotMatch(markup, /recent_4w_error_worsening|long_window_instability/);
});

test('reliability chip states that no guardrail adjustment was applied', () => {
  const markup = renderToStaticMarkup(
    createElement(StatusRail, {
      fsc: createFsc({
        reliabilityGrade: 'A',
        baseReliabilityGrade: 'A',
        reliabilityAdjustmentReasons: [],
        recent13wWeeklyPriceMape: '1.271004',
      }),
    }),
  );

  assert.match(markup, /신뢰도 A · MAPE 1\.3%/);
  assert.match(markup, /최근 13주 MAPE.*1\.27%/);
  assert.match(markup, /추가 조정 없음/);
});

test('historical status rail keeps the confirmed-actual chip without reliability disclosure', () => {
  const markup = renderToStaticMarkup(
    createElement(StatusRail, { fsc: createFsc(), historical: true }),
  );

  assert.match(markup, /확정 실적/);
  assert.doesNotMatch(markup, /신뢰도|reliability-detail/);
});

test('reason codes map to user-facing sentences without leaking internal codes', () => {
  assert.equal(
    mapReliabilityAdjustmentReason('data_stale'),
    '최신 데이터 갱신 상태를 반영해 최고 신뢰도가 제한되었습니다.',
  );
  assert.equal(
    mapReliabilityAdjustmentReason('incomplete_guardrail_metrics'),
    '안정성 평가에 필요한 데이터가 충분하지 않아 최고 등급이 제한되었습니다.',
  );
  assert.doesNotMatch(mapReliabilityAdjustmentReason('unknown_reason_code'), /unknown_reason_code/);
});
