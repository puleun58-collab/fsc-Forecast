import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WeeklyForecastSection } from './weekly-forecast-section';
import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const FSC = {
  actualWeekCount: 5,
  forecastWeekCount: 8,
  basePriceKrwPerL: '1500.00',
  weeks: [],
} as unknown as FscDashboardResultSection;

test('the active quarter caption names the Actual and Forecast line styles', () => {
  const markup = renderToStaticMarkup(createElement(WeeklyForecastSection, { fsc: FSC }));

  assert.match(markup, /완료 주차는 Actual 실선으로, 이후 주차는 Forecast 점선으로 표시합니다\./);
  assert.doesNotMatch(markup, /actual 선|forecast 점선/);
});

test('historical quarters keep their own caption', () => {
  const markup = renderToStaticMarkup(
    createElement(WeeklyForecastSection, { fsc: FSC, historical: true }),
  );

  assert.match(markup, /선택한 분기 안의 확정 Actual 주간 유가만 표시합니다\./);
});
