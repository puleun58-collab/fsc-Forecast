import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminBacktestDetail } from './admin-backtest-detail';
import type { BacktestDetailPoint } from '@/lib/forecast/backtest-detail';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function point(overrides: Partial<BacktestDetailPoint> = {}): BacktestDetailPoint {
  return {
    targetDate: '2026-08-14T00:00:00.000Z',
    originWeekEndDate: '2026-08-07T00:00:00.000Z',
    anchorKrwPerL: 1800,
    actualKrwPerL: 1845.23,
    forecastKrwPerL: 1847.91,
    absoluteErrorKrwPerL: 2.68,
    absolutePercentageErrorPct: 0.1452,
    actualDirection: 'up',
    forecastDirection: 'up',
    ...overrides,
  };
}

function render(points: readonly BacktestDetailPoint[]) {
  return renderToStaticMarkup(createElement(AdminBacktestDetail, { points }));
}

test('the backtest table stays collapsed and lists each week with signed error and direction', () => {
  const markup = render([
    point({ targetDate: '2026-08-07T00:00:00.000Z', forecastKrwPerL: 1832.4, actualKrwPerL: 1870.21, absoluteErrorKrwPerL: 37.81, absolutePercentageErrorPct: 2.0217, forecastDirection: 'down' }),
    point(),
  ]);

  assert.match(markup, /<details class="admin-panel admin-disclosure backtest-detail">/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /최근 13주 백테스트 상세/);
  assert.match(markup, /보기 ▾/);
  assert.match(markup, /1,832\.40원\/L/);
  assert.match(markup, /1,870\.21원\/L/);
  assert.match(markup, /-37\.81원\/L/);
  assert.match(markup, /2\.02%/);
  assert.match(markup, /<th scope="col">방향 적중 여부<\/th>/);
  assert.match(markup, /<span class="status-tag status-tag--warning">실패<\/span>/);
  assert.match(markup, /\+2\.68원\/L/);
  assert.match(markup, /<span class="status-tag status-tag--ok">적중<\/span>/);
  assert.doesNotMatch(markup, /status-tag--ok">방향 적중|status-tag--warning">방향 실패/);
  assert.match(markup, /<p class="admin-decision__note">오차는 Forecast에서 Actual을 뺀 값입니다\.<\/p>/);
  assert.match(
    markup,
    /<p class="admin-decision__note">방향 적중 여부는 직전 Actual 대비 다음 주 상승·하락 방향이 일치했는지를 의미합니다\.<\/p>/,
  );
});

test('rows carry mobile labels and Opinet week names', () => {
  const markup = render([point()]);

  assert.match(markup, /data-label="주차"/);
  assert.match(markup, /data-label="Forecast"/);
  assert.match(markup, /data-label="오차율"/);
  assert.match(markup, /8월 3주차|8월 2주차/);
  assert.match(markup, /2026\.08\.\d{2} ~ 2026\.08\.\d{2}/);
});

test('the one-line summary reports sample, MAPE, MAE, and direction hits', () => {
  const markup = render([
    point({ targetDate: '2026-08-07T00:00:00.000Z', absoluteErrorKrwPerL: 10, absolutePercentageErrorPct: 1, forecastDirection: 'down' }),
    point({ absoluteErrorKrwPerL: 20, absolutePercentageErrorPct: 2 }),
  ]);

  assert.match(markup, /표본 2주/);
  assert.match(markup, /MAPE 1\.50%/);
  assert.match(markup, /MAE 15\.00원\/L/);
  assert.match(markup, /방향 적중 1\/2/);
  assert.match(markup, /최대 오차 20\.00원\/L/);
});

test('runs without stored points explain that details start from the next run', () => {
  const markup = render([]);

  assert.match(markup, /백테스트 상세 데이터가 없습니다/);
  assert.match(markup, /다음 Forecast 실행부터 주차별 상세가 기록됩니다/);
  assert.doesNotMatch(markup, /<table/);
});
