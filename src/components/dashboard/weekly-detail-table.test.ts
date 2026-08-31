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
  weekEndDate: '2026-03-31T00:00:00.000Z',
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

test('historical weekly detail uses stored quarter-clipped dates', () => {
  const markup = renderToStaticMarkup(
    createElement(WeeklyDetailTable, {
      weeks: [HISTORICAL_WEEK],
      previousWeekPriceKrwPerL: null,
      useStoredWeekRange: true,
    }),
  );

  assert.match(markup, /2026\.03\.29–2026\.03\.31/);
  assert.match(markup, /3월 주차/);
  assert.doesNotMatch(markup, /2026\.04|4월/);
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
