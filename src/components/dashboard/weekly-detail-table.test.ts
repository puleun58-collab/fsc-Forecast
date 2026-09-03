import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WeeklyDetailTable } from './weekly-detail-table';
import type { FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const HISTORICAL_WEEK: FscDashboardWeekItem = {
  sequenceNo: 14,
  targetMonth: 3,
  weekNo: 14,
  weekStartDate: '2026-03-29T00:00:00.000Z',
  weekEndDate: '2026-04-02T00:00:00.000Z',
  officialWeekLabel: '2026년04월1주',
  priceKind: 'actual',
  priceKrwPerL: '1886.36',
  actualPriceKrwPerL: '1886.36',
  forecastPriceKrwPerL: null,
  forecastLowerBoundKrwPerL: null,
  forecastUpperBoundKrwPerL: null,
  forecastSourceKind: null,
  fallbackUsed: false,
  priceDiffKrwPerL: '386.36',
  diffRatio: '0.257573',
};

test('historical weekly detail shows the official Opinet week label and unclipped period', () => {
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [HISTORICAL_WEEK],
      previousWeekPriceKrwPerL: null,
      useStoredWeekRange: true,
    }),
  );

  assert.match(markup, /2026\.03\.29–2026\.04\.02/);
  assert.match(markup, /4월 1주차/);
  assert.doesNotMatch(markup, /오피넷 기준 주차|ISO 14|14주|3월 주차|오피넷 공식 주차/);
});

test('public weekly detail hides expected ranges while retaining the forecast value', () => {
  const forecastWeek: FscDashboardWeekItem = {
    ...HISTORICAL_WEEK,
    sequenceNo: 1,
    targetMonth: 9,
    weekStartDate: '2026-08-30T00:00:00.000Z',
    weekEndDate: '2026-09-03T00:00:00.000Z',
    priceKind: 'forecast',
    priceKrwPerL: '1837.44',
    actualPriceKrwPerL: null,
    forecastPriceKrwPerL: '1837.44',
    forecastLowerBoundKrwPerL: '1779.46',
    forecastUpperBoundKrwPerL: '1895.41',
    forecastSourceKind: 'weekly_point',
    officialWeekLabel: null,
  };
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [forecastWeek],
      previousWeekPriceKrwPerL: '1845.23',
    }),
  );

  assert.match(markup, /1,837\.44/);
  assert.match(markup, /주간 예측값/);
  assert.doesNotMatch(markup, /90% 예상 범위|1,779\.46|1,895\.41/);
});

test('active quarter weekly detail shows only the Opinet month-week name', () => {
  const actualWeek: FscDashboardWeekItem = {
    ...HISTORICAL_WEEK,
    sequenceNo: 1,
    targetMonth: 7,
    weekNo: 27,
    weekStartDate: '2026-07-01T00:00:00.000Z',
    weekEndDate: '2026-07-02T00:00:00.000Z',
    officialWeekLabel: null,
  };
  const forecastWeek: FscDashboardWeekItem = {
    ...actualWeek,
    sequenceNo: 10,
    targetMonth: 9,
    weekNo: 36,
    weekStartDate: '2026-08-30T00:00:00.000Z',
    weekEndDate: '2026-09-03T00:00:00.000Z',
    priceKind: 'forecast',
    forecastSourceKind: 'weekly_point',
  };
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [actualWeek, forecastWeek],
      previousWeekPriceKrwPerL: null,
    }),
  );

  assert.match(markup, /7월 1주차/);
  assert.match(markup, /9월 1주차/);
  assert.doesNotMatch(markup, /오피넷 기준 주차|ISO 27|ISO 36/);
});

function opinetWeek(
  sequenceNo: number,
  weekStartDate: string,
  weekEndDate: string,
  targetMonth: number,
  priceKind: FscDashboardWeekItem['priceKind'] = 'actual',
): FscDashboardWeekItem {
  return {
    ...HISTORICAL_WEEK,
    sequenceNo,
    targetMonth,
    weekNo: sequenceNo,
    weekStartDate,
    weekEndDate,
    officialWeekLabel: null,
    priceKind,
    forecastSourceKind: priceKind === 'forecast' ? 'weekly_point' : null,
  };
}

test('every quarter marks the first row of a new display month', () => {
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [
        opinetWeek(1, '2026-03-29T00:00:00.000Z', '2026-04-02T00:00:00.000Z', 4),
        opinetWeek(2, '2026-04-05T00:00:00.000Z', '2026-04-09T00:00:00.000Z', 4),
        opinetWeek(3, '2026-05-03T00:00:00.000Z', '2026-05-07T00:00:00.000Z', 5),
      ],
      previousWeekPriceKrwPerL: null,
      useStoredWeekRange: true,
    }),
  );
  const rowClasses = [...markup.matchAll(/<tr class="(weekly-table__row[^"]*)"/g)].map((match) => match[1]);

  assert.deepEqual(rowClasses, [
    'weekly-table__row weekly-table__row--actual',
    'weekly-table__row weekly-table__row--actual',
    'weekly-table__row weekly-table__row--actual weekly-table__row--month-start',
  ]);
  assert.equal(markup.match(/weekly-mobile-item--month-start/g)?.length, 1);
});

test('a forecast boundary replaces the month divider when both fall on the same row', () => {
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [
        opinetWeek(1, '2026-08-16T00:00:00.000Z', '2026-08-20T00:00:00.000Z', 8),
        opinetWeek(2, '2026-08-23T00:00:00.000Z', '2026-08-27T00:00:00.000Z', 8),
        opinetWeek(3, '2026-08-30T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 9, 'forecast'),
      ],
      previousWeekPriceKrwPerL: null,
    }),
  );

  assert.match(markup, /weekly-table__boundary/);
  assert.doesNotMatch(markup, /weekly-table__row--month-start/);
});

test('a forecast week shows the expected range only when its horizon is published', () => {
  const forecastWeek: FscDashboardWeekItem = {
    ...HISTORICAL_WEEK,
    sequenceNo: 2,
    priceKind: 'forecast',
    priceKrwPerL: '2050.00',
    actualPriceKrwPerL: null,
    forecastPriceKrwPerL: '2050.00',
    forecastLowerBoundKrwPerL: '1992.00',
    forecastUpperBoundKrwPerL: '2117.00',
    forecastSourceKind: 'weekly_point',
    officialWeekLabel: null,
  };
  const hidden = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [forecastWeek],
      previousWeekPriceKrwPerL: null,
    }),
  );
  const published = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [forecastWeek],
      previousWeekPriceKrwPerL: null,
      publishableIntervalHorizonWeeks: [1],
    }),
  );

  assert.doesNotMatch(hidden, /예상 범위/);
  assert.match(published, /예상 범위 1,992\.00원\/L ~ 2,117\.00원\/L/);
  assert.doesNotMatch(published, /최저|최고 예상가|확정 범위/);
});

test('a horizon that is not published keeps its centre forecast', () => {
  const first: FscDashboardWeekItem = {
    ...HISTORICAL_WEEK,
    sequenceNo: 2,
    priceKind: 'forecast',
    priceKrwPerL: '2050.00',
    actualPriceKrwPerL: null,
    forecastPriceKrwPerL: '2050.00',
    forecastLowerBoundKrwPerL: '1992.00',
    forecastUpperBoundKrwPerL: '2117.00',
    forecastSourceKind: 'weekly_point',
    officialWeekLabel: null,
  };
  const second: FscDashboardWeekItem = { ...first, sequenceNo: 3, priceKrwPerL: '2070.00' };
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [first, second],
      previousWeekPriceKrwPerL: null,
      publishableIntervalHorizonWeeks: [1],
    }),
  );

  assert.equal(markup.match(/예상 범위/g)?.length, 1);
  assert.match(markup, /2,070\.00/);
});
