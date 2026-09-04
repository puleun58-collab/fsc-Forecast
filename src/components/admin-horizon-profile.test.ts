import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminHorizonProfile } from './admin-horizon-profile';
import { buildHorizonPerformance } from '@/lib/forecast/horizon-performance';
import { buildPredictionIntervalCalibration } from '@/lib/forecast/prediction-interval';
import type { WalkForwardEvaluationPoint } from '@/lib/forecast/run-walk-forward-backtest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_ORIGIN = Date.UTC(2026, 0, 8);

function point(originIndex: number, horizonIndex: number, residual: number): WalkForwardEvaluationPoint {
  const originWeekEndDate = new Date(FIRST_ORIGIN + originIndex * WEEK_MS);
  const forecastKrwPerL = 2000;
  const actualKrwPerL = forecastKrwPerL + residual;

  return {
    originWeekEndDate,
    targetDate: new Date(originWeekEndDate.getTime() + horizonIndex * WEEK_MS),
    horizonIndex,
    anchorKrwPerL: 1990,
    actualKrwPerL,
    forecastKrwPerL,
    absoluteErrorKrwPerL: Math.abs(residual),
    absolutePercentageErrorPct: (Math.abs(residual) / actualKrwPerL) * 100,
    actualDirection: 'up',
    forecastDirection: 'up',
    trendDeltaKrwPerL: 2,
    dubaiContributionRatio: null,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0,
    externalAdjustmentRatio: 0,
    externalAdjustmentCapReached: false,
  };
}

const POINTS = Array.from({ length: 13 }, (_, index) => index + 1).flatMap((horizon) =>
  Array.from({ length: 20 }, (_, originIndex) =>
    point(originIndex, horizon, (originIndex % 2 === 0 ? 1 : -1) * (10 + horizon * 10)),
  ),
);

const PERFORMANCE = buildHorizonPerformance({
  evaluationPoints: POINTS,
  horizonCount: 13,
  evaluatedAt: new Date('2026-06-01T00:00:00.000Z'),
});

const INTERVAL = buildPredictionIntervalCalibration({
  evaluationPoints: POINTS,
  horizonCount: 13,
  evaluatedAt: new Date('2026-06-01T00:00:00.000Z'),
});

function render(
  performance = PERFORMANCE as Parameters<typeof AdminHorizonProfile>[0]['performance'],
  interval = INTERVAL as Parameters<typeof AdminHorizonProfile>[0]['interval'],
): string {
  return renderToStaticMarkup(createElement(AdminHorizonProfile, { performance, interval }));
}

test('the summary leads with the four representative distances and their samples', () => {
  const markup = render();
  const summary = markup.slice(0, markup.indexOf('구간 평균'));

  assert.match(summary, /1주 후<\/span><strong>MAE 20\.00원\/L/);
  assert.match(summary, /4주 후<\/span><strong>MAE 50\.00원\/L/);
  assert.match(summary, /8주 후<\/span><strong>MAE 90\.00원\/L/);
  assert.match(summary, /13주 후<\/span><strong>MAE 140\.00원\/L/);
  assert.match(summary, /평가 20개/);
  assert.doesNotMatch(summary, /5주 후/);
});

test('the degradation start is stated in plain words', () => {
  const markup = render();

  assert.match(markup, /5주 이후 오차 증가/);
});

test('band averages never replace the individual distances', () => {
  const markup = render();

  assert.match(markup, /단기 1~4주/);
  assert.match(markup, /중기 5~8주/);
  assert.match(markup, /장기 9~13주/);
  assert.match(markup, /13주 후<\/th><td data-label="표본">20개/);
  assert.doesNotMatch(markup, /근거리|중거리|장거리/);
});

test('the full table stays collapsed and carries every metric with its sample count', () => {
  const markup = render();
  const tableStart = markup.indexOf('예측 기간별 상세 보기');

  assert.ok(tableStart > 0);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /<th scope="col">방향 정확도<\/th>/);
  assert.match(markup, /data-label="MAPE">1\.00%/);
  assert.match(markup, /data-label="최대 오차">20\.00원\/L/);
});

test('interval coverage is shown against the configured target with widths', () => {
  const markup = render();

  assert.match(markup, /예측 범위 적중률/);
  assert.match(markup, /목표 80\.0%/);
  assert.match(markup, /평균 범위 폭/);
  assert.match(markup, /전체 가중 적중률/);
  assert.match(markup, /중심 예측값·FSC 계산을\s+바꾸지 않습니다|중심 예측값·FSC 계산을 바꾸지 않습니다/);
  assert.match(markup, /범위 산정 표본/);
  assert.match(markup, /과거 예측 오차 분포/);
  assert.match(markup, /예상 범위 공개 (켜짐|꺼짐)/);
  assert.doesNotMatch(markup, /calibration 표본|공개 설정 ON|공개 설정 OFF/);
});

test('runs from before the feature render the empty state', () => {
  const markup = render(null, null);

  assert.match(markup, /예측 기간별 성능 이력 없음/);
  assert.doesNotMatch(markup, /<table/);
});

test('a run without interval calibration still shows the horizon profile', () => {
  const markup = render(PERFORMANCE, null);

  assert.match(markup, /예측 범위 검증 이력이 없습니다/);
  assert.match(markup, /1주 후/);
});
