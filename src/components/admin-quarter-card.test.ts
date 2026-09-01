import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminQuarterCard, type AdminQuarterCardResult } from './admin-quarter-card';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const RESULT: AdminQuarterCardResult = {
  id: 'fsc-result-1',
  approvalStatus: 'pending',
  dataFreshnessStatus: 'fresh',
  reliabilityGrade: 'C',
  reliabilitySampleCount: 13,
  reliabilityMinimumSampleCount: 13,
  recent13wWeeklyPriceMape: '1.47',
  actualWeekCount: 10,
  forecastWeekCount: 3,
  quarterAverageKrwPerL: '1851.370',
  previousQuarterAverageKrwPerL: '1839.020',
};

function render(result: AdminQuarterCardResult | null): string {
  return renderToStaticMarkup(
    createElement(AdminQuarterCard, {
      quarterLabel: '2026년 3분기',
      referenceQuarterLabel: '2026년 2분기',
      periodLabel: '2026.07.01 ~ 2026.09.30',
      result,
    }),
  );
}

test('the operating quarter card shows humanized operating state without raw enums', () => {
  const markup = render(RESULT);

  assert.match(markup, /현재 운영 분기/);
  assert.match(markup, /2026년 3분기/);
  assert.match(markup, /현재 활성 분기의 FSC 운영 상태와 주요 지표입니다/);
  assert.match(markup, /참조 분기 2026년 2분기/);
  assert.match(markup, /기간 2026\.07\.01 ~ 2026\.09\.30/);
  assert.match(markup, /승인 상태<\/span><strong>승인 대기<\/strong>/);
  assert.match(markup, /데이터 최신성<\/span><strong>최신<\/strong>/);
  assert.match(markup, /신뢰도<\/span><strong>C · MAPE 1\.5%<\/strong>/);
  assert.match(markup, /주차 구성<\/span><strong>Actual 10주 · Forecast 3주<\/strong>/);
  assert.match(markup, /분기 예상 평균<\/span><strong>1,851\.37원\/L<\/strong>/);
  assert.match(markup, /직전 결과 대비/);
  assert.match(markup, /분기 예상 평균 \+12\.35원\/L/);
  assert.doesNotMatch(markup, /pending|fresh|stale|unavailable|상태 active/);
  assert.doesNotMatch(markup, /approval<|freshness<|quarter average</);
});

test('reliability deep-dive rows stay in the forecast diagnostics card only', () => {
  const markup = render(RESULT);

  assert.doesNotMatch(markup, /Reliability 상세/);
  assert.doesNotMatch(markup, /guardrail 판정/);
  assert.doesNotMatch(markup, /조정 사유 코드/);
  assert.doesNotMatch(markup, /4주 bias|13주 bias/);
  assert.doesNotMatch(markup, /26주 MAE|13주 방향 정확도/);
  assert.doesNotMatch(markup, /유효 백테스트 수/);
});

test('manual quarter transition is a collapsed advanced action separated from routine actions', () => {
  const markup = render(RESULT);
  const advancedStart = markup.indexOf('<details class="admin-panel admin-disclosure">');
  const advancedBlock = markup.slice(advancedStart, markup.indexOf('</details>', advancedStart));
  const routineBlock = markup.slice(0, advancedStart);

  assert.ok(advancedStart > 0);
  assert.doesNotMatch(markup.slice(advancedStart, advancedStart + 60), /\sopen(?:=|>|\s)/);
  assert.match(advancedBlock, /고급 운영/);
  assert.match(advancedBlock, /수동 분기 전환은 현재 운영 분기를 강제로 다음 분기로 이동합니다/);
  assert.match(advancedBlock, /class="button button--danger"[^>]*>수동 분기 전환</);
  assert.match(routineBlock, /FSC 재계산/);
  assert.match(routineBlock, /기준 시나리오 승인/);
  assert.doesNotMatch(routineBlock, /수동 분기 전환|수동 rollover/);
  assert.equal(markup.match(/수동 분기 전환</g)?.length, 1);
});

test('a quarter without an FSC result keeps recompute and advanced operations available', () => {
  const markup = render(null);

  assert.match(markup, /아직 현재 운영 분기의 FSC 결과가 없습니다/);
  assert.match(markup, /FSC 재계산/);
  assert.match(markup, /고급 운영/);
  assert.doesNotMatch(markup, /기준 시나리오 승인/);
  assert.doesNotMatch(markup, /직전 결과 대비/);
});
