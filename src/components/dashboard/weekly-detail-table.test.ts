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
