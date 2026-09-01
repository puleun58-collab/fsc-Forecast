import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminWeekComposition, type AdminWeekCompositionWeek } from './admin-week-composition';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function week(overrides: Partial<AdminWeekCompositionWeek> = {}): AdminWeekCompositionWeek {
  return {
    sequenceNo: 1,
    targetMonth: 8,
    weekStartDate: '2026-08-23T00:00:00.000Z',
    weekEndDate: '2026-08-27T00:00:00.000Z',
    officialWeekLabel: '2026년08월4주',
    priceKind: 'actual',
    priceKrwPerL: '1845.23',
    forecastSourceKind: null,
    fallbackUsed: false,
    ...overrides,
  };
}

const WEEKS: AdminWeekCompositionWeek[] = [
  week(),
  week({
    sequenceNo: 2,
    targetMonth: 9,
    weekStartDate: '2026-08-30T00:00:00.000Z',
    weekEndDate: '2026-09-03T00:00:00.000Z',
    officialWeekLabel: '2026년09월1주',
    priceKind: 'forecast',
    priceKrwPerL: '1848.70',
    forecastSourceKind: 'weekly_point',
  }),
  week({
    sequenceNo: 3,
    targetMonth: 9,
    weekStartDate: '2026-09-06T00:00:00.000Z',
    weekEndDate: '2026-09-10T00:00:00.000Z',
    officialWeekLabel: null,
    priceKind: 'forecast',
    priceKrwPerL: null,
    forecastSourceKind: 'weekly_trend_extension',
    fallbackUsed: true,
  }),
];

function render(weeks: readonly AdminWeekCompositionWeek[], quarterAverage: string | null = '1851.370') {
  return renderToStaticMarkup(
    createElement(AdminWeekComposition, {
      actualWeekCount: 10,
      forecastWeekCount: 3,
      quarterAverageKrwPerL: quarterAverage,
      weeks,
    }),
  );
}

test('the default view summarizes actual, forecast, and the quarter average only', () => {
  const markup = render(WEEKS);
  const summaryEnd = markup.indexOf('<details');

  assert.match(markup, /주차 구성/);
  assert.match(markup, /현재 분기의 실제값과 예측값 구성을 확인합니다/);
  assert.match(markup, /3개 주차/);
  assert.match(markup.slice(0, summaryEnd), /Actual<\/span><strong>10주<\/strong>/);
  assert.match(markup.slice(0, summaryEnd), /Forecast<\/span><strong>3주<\/strong>/);
  assert.match(markup.slice(0, summaryEnd), /분기 예상 평균<\/span><strong>1,851\.37원\/L<\/strong>/);
  assert.match(markup, /주차 상세 보기 ▾/);
  assert.doesNotMatch(markup, /weekly_point|weekly_trend_extension|carry_forward|_fallback/);
});

test('week rows stay collapsed and keep the stored sequence order when expanded', () => {
  const markup = render([...WEEKS].reverse());
  const detailsStart = markup.indexOf('<details class="admin-panel admin-disclosure">');
  const rows = [...markup.matchAll(/<li class="week-composition-row[^"]*">(.*?)<\/li>/gs)].map(
    (match) => match[1] ?? '',
  );

  assert.doesNotMatch(markup.slice(detailsStart, detailsStart + 60), /\sopen(?:=|>|\s)/);
  assert.equal(rows.length, 3);
  assert.match(rows[0]!, /8월 4주차/);
  assert.match(rows[0]!, /2026\.08\.23 ~ 2026\.08\.27/);
  assert.match(rows[0]!, /<span class="status-tag status-tag--ok">Actual<\/span>/);
  assert.match(rows[0]!, /1,845\.23원\/L/);
  assert.doesNotMatch(rows[0]!, /산출 근거 보기/);
  assert.match(rows[1]!, /9월 1주차/);
  assert.match(rows[1]!, /<span class="status-tag">Forecast<\/span>/);
  assert.match(rows[1]!, /1,848\.70원\/L/);
  assert.match(rows[2]!, /9월 2주차/);
  assert.match(rows[2]!, /산정 중/);
  assert.match(rows[2]!, /대체값 사용/);
});

test('forecast rows explain their source in plain language behind a second disclosure', () => {
  const markup = render(WEEKS);

  assert.equal(markup.match(/산출 근거 보기/g)?.length, 2);
  assert.match(markup, /<p>주간 예측값<\/p>/);
  assert.match(markup, /<p>주간 추세 연장값<\/p>/);
});

test('a completed quarter without forecast weeks renders actual-only composition', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminWeekComposition, {
      actualWeekCount: 13,
      forecastWeekCount: 0,
      quarterAverageKrwPerL: '1774.500',
      weeks: [week()],
    }),
  );

  assert.match(markup, /Actual<\/span><strong>13주<\/strong>/);
  assert.match(markup, /Forecast<\/span><strong>0주<\/strong>/);
  assert.doesNotMatch(markup, /산출 근거 보기/);
});

test('a quarter without any week data explains how the composition appears', () => {
  const markup = render([], null);

  assert.match(markup, /아직 주차 데이터가 없습니다/);
  assert.match(markup, /FSC 재계산 후 Actual \/ Forecast 구성이 표시됩니다/);
  assert.doesNotMatch(markup, /주차 상세 보기/);
});
