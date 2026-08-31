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

test('reliability chip explains the final grade with evaluation factors instead of a downgrade path', () => {
  const markup = renderToStaticMarkup(createElement(StatusRail, { fsc: createFsc() }));

  assert.match(markup, /신뢰도 C · MAPE 1\.5%/);
  assert.match(markup, /예측 신뢰도.*C/);
  assert.match(markup, /최근 13주 평균 오차\(MAPE\).*1\.53%/);
  assert.match(markup, /신뢰도 참고 요인/);
  assert.match(markup, /최근 단기 오차 변동성이 커져 신뢰도 평가에 반영되었습니다\./);
  assert.match(markup, /장기 예측 성능의 안정성을 보수적으로 반영했습니다\./);
  assert.match(markup, /신뢰도는 최근 예측 정확도뿐 아니라/);
  assert.doesNotMatch(markup, /기본 등급|최종 등급|하향|강등|악화|불안정/);
  assert.doesNotMatch(markup, /recent_4w_error_worsening|long_window_instability/);
});

test('reliability chip omits the factor list when no guardrail was applied', () => {
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
  assert.match(markup, /최근 13주 평균 오차\(MAPE\).*1\.27%/);
  assert.doesNotMatch(markup, /신뢰도 참고 요인|기본 등급|최종 등급/);
});

test('historical status rail keeps the confirmed-actual chip without reliability disclosure', () => {
  const markup = renderToStaticMarkup(
    createElement(StatusRail, { fsc: createFsc(), historical: true }),
  );

  assert.match(markup, /확정 실적/);
  assert.doesNotMatch(markup, /신뢰도|reliability-detail/);
});

test('reason codes map to neutral user-facing sentences without leaking internal codes', () => {
  assert.equal(
    mapReliabilityAdjustmentReason('data_stale'),
    '데이터 최신성 상태를 신뢰도 평가에 반영했습니다.',
  );
  assert.equal(
    mapReliabilityAdjustmentReason('long_window_caution'),
    '단기 정확도와 장기 성능을 함께 고려했습니다.',
  );
  assert.doesNotMatch(mapReliabilityAdjustmentReason('unknown_reason_code'), /unknown_reason_code/);
});
