import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AdminWeekComposition,
  type AdminForecastBasis,
  type AdminWeekCompositionWeek,
} from './admin-week-composition';

import {
  explainFirstWeeklyForecast,
  readWeeklyForecastCalculation,
} from '@/lib/forecast/forecast-diagnostics';

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

const SEPTEMBER_CALCULATION = readWeeklyForecastCalculation({
  weeklyForecast: {
    status: 'ready',
    anchorWeekEndDate: '2026-09-03T00:00:00.000Z',
    anchorPriceKrwPerL: 1844.478,
    trendDeltaKrwPerL: -2.569,
    trendLookbackCount: 8,
    externalAdjustmentRatio: 0.01724436741767766,
    externalAdjustmentCapRatio: 0.03,
    externalAdjustmentCapReached: false,
    dubai: {
      indicatorCode: 'dubai',
      lagWeeks: 1,
      weight: 0.2,
      basisWeekEndDate: '2026-09-03T00:00:00.000Z',
      basisValue: 100.28,
      previousWeekEndDate: '2026-08-27T00:00:00.000Z',
      previousValue: 92.32,
      changeRatio: 0.0862218370883883,
      contributionRatio: 0.01724436741767766,
    },
    usdKrw: null,
  },
});
const SEPTEMBER_EXPLANATION = explainFirstWeeklyForecast(SEPTEMBER_CALCULATION, 1873.672);
assert.ok(SEPTEMBER_EXPLANATION);

const SEPTEMBER_FORECAST_BASIS: AdminForecastBasis = {
  modelId: 'B',
  trendLookbackWeeks: 8,
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: null,
  explanation: SEPTEMBER_EXPLANATION,
};

function render(
  weeks: readonly AdminWeekCompositionWeek[],
  quarterAverage: string | null = '1851.370',
  forecastBasis: AdminForecastBasis | null = {
    modelId: 'B',
    trendLookbackWeeks: 8,
    dubai: { lagWeeks: 2, weight: 0.2 },
    usdKrw: null,
  },
) {
  return renderToStaticMarkup(
    createElement(AdminWeekComposition, {
      actualWeekCount: 10,
      forecastWeekCount: 3,
      quarterAverageKrwPerL: quarterAverage,
      weeks,
      forecastBasis,
    }),
  );
}

test('the default view summarizes actual, forecast, and the quarter average only', () => {
  const markup = render(WEEKS);
  const summaryEnd = markup.indexOf('<details');

  assert.match(markup, /주차 구성/);
  assert.match(markup, /현재 분기의 Actual\/Forecast 구성을 확인합니다/);
  assert.match(markup, /3개 주차/);
  assert.match(markup.slice(0, summaryEnd), /Actual<\/span><strong>10주<\/strong>/);
  assert.match(markup.slice(0, summaryEnd), /Forecast<\/span><strong>3주<\/strong>/);
  assert.match(markup.slice(0, summaryEnd), /분기 예상 평균<\/span><strong>1,851\.37원\/L<\/strong>/);
  assert.match(markup, /<strong>주차 상세<\/strong><span class="admin-disclosure__toggle" aria-hidden="true"><span class="admin-disclosure__toggle-closed">보기 ▾<\/span><span class="admin-disclosure__toggle-open">접기 ▴<\/span><\/span>/);
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
  assert.match(rows[1]!, /9월 1주차/);
  assert.match(rows[1]!, /<span class="status-tag">Forecast<\/span>/);
  assert.match(rows[1]!, /1,848\.70원\/L/);
  assert.match(rows[2]!, /9월 2주차/);
  assert.match(rows[2]!, /산정 중/);
});

test('only exceptional forecast weeks carry a per-row source note', () => {
  const markup = render(WEEKS);
  const rows = [...markup.matchAll(/<li class="week-composition-row[^"]*">(.*?)<\/li>/gs)].map(
    (match) => match[1] ?? '',
  );

  assert.doesNotMatch(rows[0]!, /week-composition-row__exception/);
  assert.doesNotMatch(rows[1]!, /week-composition-row__exception/);
  assert.match(rows[2]!, /<span class="status-tag status-tag--warning">대체값 사용<\/span>/);
  assert.match(rows[2]!, /주간 추세 연장값/);
  assert.equal(markup.match(/week-composition-row__exception/g)?.length, 1);
  assert.doesNotMatch(markup, /산출 근거 보기/);
});

test('one shared disclosure explains how forecast weeks are produced', () => {
  const markup = render(WEEKS);
  const basisStart = markup.indexOf('Forecast 산출 근거');
  const basisBlock = markup.slice(basisStart);

  assert.ok(basisStart > 0);
  assert.equal(markup.match(/Forecast 산출 근거/g)?.length, 1);
  assert.match(basisBlock, /예측 방식<\/span><strong>주간 실제값 기준 추세 연장<\/strong>/);
  assert.match(basisBlock, /사용 모델<\/span><strong>Model B<\/strong>/);
  assert.match(basisBlock, /추세 기간<\/span><strong>8주<\/strong>/);
  assert.match(basisBlock, /Dubai<\/span><strong>반영 시차 2주 · 비중 20%<\/strong>/);
  assert.match(basisBlock, /USD\/KRW<\/span><strong>미사용<\/strong>/);
});

test('a completed quarter without forecast weeks renders actual-only composition', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminWeekComposition, {
      actualWeekCount: 13,
      forecastWeekCount: 0,

      quarterAverageKrwPerL: '1774.500',
      weeks: [week()],
      forecastBasis: null,
    }),
  );

  assert.match(markup, /Actual<\/span><strong>13주<\/strong>/);
  assert.match(markup, /Forecast<\/span><strong>0주<\/strong>/);
  assert.doesNotMatch(markup, /Forecast 산출 근거/);
});

test('forecast basis leads with the dominant cause and the core calculation path', () => {
  const markup = render(WEEKS, '1851.370', SEPTEMBER_FORECAST_BASIS);
  const basisStart = markup.indexOf('Forecast 산출 근거');
  const basisBlock = markup.slice(basisStart);
  const coreLabels = [
    '기준 Actual',
    '기본 추세',
    'Dubai 보정',
    'USD/KRW 보정',
    '실제 외부 보정',
    '첫 Forecast',
  ];

  assert.doesNotMatch(basisBlock.slice(0, 80), /\sopen(?:=|>|\s)/);
  coreLabels.reduce((previousIndex, label) => {
    const index = basisBlock.indexOf(`${label}</span>`);
    assert.ok(index > previousIndex, `${label} should follow the preceding core step`);
    return index;
  }, -1);
  const firstForecastIndex = basisBlock.indexOf('첫 Forecast</span>');
  const causeSummaryIndex = basisBlock.indexOf('첫 Forecast 상승의 주원인');
  const auxiliaryIndex = basisBlock.indexOf('추세 적용 후</span>');
  const settingsIndex = basisBlock.indexOf('예측 방식</span>');

  assert.ok(causeSummaryIndex > firstForecastIndex);
  assert.ok(auxiliaryIndex > causeSummaryIndex);
  assert.ok(settingsIndex > auxiliaryIndex);
  assert.equal(
    basisBlock.match(/admin-metric forecast-basis__metric/g)?.length,
    9,
  );
  assert.match(
    basisBlock,
    /forecast-basis__metric--dominant"><span class="dashboard-shell__metric-label">Dubai 보정<\/span><strong class="forecast-basis__value">\+31\.76원\/L<\/strong>/,
  );
  assert.match(
    basisBlock,
    /92\.32 → 100\.28 · \+8\.62%<\/span><span>비중 20% · 기여 \+1\.72%/,
  );
  assert.doesNotMatch(basisBlock, /2026\.08\.27|2026\.09\.03/);
  assert.match(
    basisBlock,
    /forecast-basis__metric--trend"><span class="dashboard-shell__metric-label">기본 추세<\/span><strong class="forecast-basis__value">-2\.57원\/L<\/strong>/,
  );
  assert.match(
    basisBlock,
    /forecast-basis__metric--inactive"><span class="dashboard-shell__metric-label">USD\/KRW 보정<\/span><strong class="forecast-basis__value">미사용 · 0\.00원\/L<\/strong>/,
  );
  assert.match(
    basisBlock,
    /forecast-basis__metric--result"><span class="dashboard-shell__metric-label">첫 Forecast<\/span><strong class="forecast-basis__value">1,873\.67원\/L<\/strong>/,
  );
  assert.match(basisBlock, /예측 시작 구간 변동 · \+29\.19원\/L · \+1\.58%/);
  assert.match(
    basisBlock,
    /첫 Forecast 상승의 주원인 ·<\/span><strong>Dubai 보정 \+31\.76원\/L<\/strong>/,
  );
  assert.match(
    basisBlock,
    /기본 추세 -2\.57원\/L<span aria-hidden="true">\+<\/span>Dubai 보정 \+31\.76원\/L<span aria-hidden="true">=<\/span>첫 Forecast 변화 \+29\.19원\/L/,
  );
  assert.match(
    basisBlock,
    /추세 적용 후<\/span><strong class="forecast-basis__value">1,841\.91원\/L<\/strong>/,
  );
  assert.match(
    basisBlock,
    /외부 신호 합산<\/span><strong class="forecast-basis__value">\+1\.72%<\/strong>/,
  );
  assert.match(
    basisBlock,
    /외부 보정 상한<\/span><strong class="forecast-basis__value">미적용 · 설정 ±3%<\/strong>/,
  );
  assert.doesNotMatch(basisBlock, /저장된 산출 근거로 재현되지 않습니다/);
});

test('dominant cause follows the largest aligned contribution instead of a fixed signal', () => {
  const calculation = readWeeklyForecastCalculation({
    weeklyForecast: {
      status: 'ready',
      anchorWeekEndDate: '2026-09-03T00:00:00.000Z',
      anchorPriceKrwPerL: 1000,
      trendDeltaKrwPerL: -5,
      trendLookbackCount: 8,
      externalAdjustmentRatio: 0.022,
      externalAdjustmentCapRatio: 0.03,
      externalAdjustmentCapReached: false,
      dubai: {
        indicatorCode: 'dubai',
        lagWeeks: 1,
        weight: 0.1,
        basisWeekEndDate: '2026-09-03T00:00:00.000Z',
        basisValue: 102,
        previousWeekEndDate: '2026-08-27T00:00:00.000Z',
        previousValue: 100,
        changeRatio: 0.02,
        contributionRatio: 0.002,
      },
      usdKrw: {
        indicatorCode: 'usdKrw',
        lagWeeks: 1,
        weight: 0.1,
        basisWeekEndDate: '2026-09-03T00:00:00.000Z',
        basisValue: 1200,
        previousWeekEndDate: '2026-08-27T00:00:00.000Z',
        previousValue: 1000,
        changeRatio: 0.2,
        contributionRatio: 0.02,
      },
    },
  });
  const explanation = explainFirstWeeklyForecast(calculation, 1016.89);
  assert.ok(explanation);

  const markup = render(WEEKS, '1005.00', {
    modelId: 'C',
    trendLookbackWeeks: 8,
    dubai: { lagWeeks: 1, weight: 0.1 },
    usdKrw: { lagWeeks: 1, weight: 0.1 },
    explanation,
  });
  const basisBlock = markup.slice(markup.indexOf('Forecast 산출 근거'));

  assert.match(
    basisBlock,
    /forecast-basis__metric--dominant"><span class="dashboard-shell__metric-label">USD\/KRW 보정<\/span><strong class="forecast-basis__value">\+19\.90원\/L<\/strong>/,
  );
  assert.match(
    basisBlock,
    /첫 Forecast 상승의 주원인 ·<\/span><strong>USD\/KRW 보정 \+19\.90원\/L<\/strong>/,
  );
  assert.doesNotMatch(
    basisBlock,
    /첫 Forecast 상승의 주원인 ·<\/span><strong>Dubai 보정/,
  );
});

test('rounded additive relationship stays hidden when displayed values do not reconcile', () => {
  const calculation = readWeeklyForecastCalculation({
    weeklyForecast: {
      status: 'ready',
      anchorWeekEndDate: '2026-09-03T00:00:00.000Z',
      anchorPriceKrwPerL: 100,
      trendDeltaKrwPerL: 0.004,
      trendLookbackCount: 8,
      externalAdjustmentRatio: 0.00004,
      externalAdjustmentCapRatio: 0.03,
      externalAdjustmentCapReached: false,
      dubai: {
        indicatorCode: 'dubai',
        lagWeeks: 1,
        weight: 0.2,
        basisWeekEndDate: '2026-09-03T00:00:00.000Z',
        basisValue: 100.02,
        previousWeekEndDate: '2026-08-27T00:00:00.000Z',
        previousValue: 100,
        changeRatio: 0.0002,
        contributionRatio: 0.00004,
      },
      usdKrw: null,
    },
  });
  const explanation = explainFirstWeeklyForecast(calculation, 100.008);
  assert.ok(explanation);
  assert.equal(explanation.formulaMatchesStoredForecast, true);

  const markup = render(WEEKS, '100.00', {
    modelId: 'B',
    trendLookbackWeeks: 8,
    dubai: { lagWeeks: 1, weight: 0.2 },
    usdKrw: null,
    explanation,
  });

  assert.doesNotMatch(markup, /forecast-basis__equation/);
});

test('a quarter without any week data explains how the composition appears', () => {
  const markup = render([], null, null);

  assert.match(markup, /아직 주차 데이터가 없습니다/);
  assert.match(markup, /FSC 재계산 후 Actual \/ Forecast 구성이 표시됩니다/);
  assert.doesNotMatch(markup, /주차 상세/);
});
