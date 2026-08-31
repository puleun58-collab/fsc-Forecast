import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarketReferencePanel } from './market-reference-panel';
import type { FscDashboardSupportSection } from '@/lib/dashboard/fsc-types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function dailyHistory(startValue: number, step: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    observedAt: `2026-08-${String(index + 3).padStart(2, '0')}T00:00:00.000Z`,
    value: Number((startValue + step * index).toFixed(2)),
  }));
}

test('market reference panel keeps only Dubai oil and USD KRW cards', () => {
  const support = {
    marketSignals: {
      status: 'ready',
      summaryText: '시장 흐름 요약',
      signals: [
        {
          indicatorCode: 'dubai',
          displayName: '두바이유',
          status: 'ready',
          latestObservationDate: '2026-08-27',
          previousObservationDate: '2026-08-26',
          collectedAt: '2026-08-28T00:00:00.000Z',
          value: 70.25,
          previousValue: 70,
          absoluteChange: 0.25,
          percentChange: 0.3571,
          direction: 'up',
          explanation: '두바이유 흐름',
          unitLabel: 'USD/BBL',
          valueBasisLabel: '일별 종가',
          providerName: '오피넷',
          sourceUrl: 'https://example.com/dubai',
          trendWindowDays: 30,
          history: dailyHistory(68.5, 0.07, 25),
        },
        {
          indicatorCode: 'usd-krw',
          displayName: 'USD/KRW',
          status: 'ready',
          latestObservationDate: '2026-08-27',
          previousObservationDate: '2026-08-26',
          collectedAt: '2026-08-28T00:00:00.000Z',
          value: 1325.4,
          previousValue: 1324.8,
          absoluteChange: 0.6,
          percentChange: 0.0453,
          direction: 'up',
          explanation: '환율 흐름',
          unitLabel: '원/USD',
          valueBasisLabel: '일별 기준환율',
          providerName: 'ECB',
          sourceUrl: 'https://example.com/usd-krw',
          trendWindowDays: 30,
          history: dailyHistory(1320.1, 0.21, 25),
        },
      ],
    },
  } as FscDashboardSupportSection;
  const markup = renderToStaticMarkup(createElement(MarketReferencePanel, { support }));

  assert.match(markup, /시장 참고 지표/);
  assert.match(markup, /두바이유와 환율의 최신 흐름을 표시합니다/);
  assert.match(markup, /두바이유/);
  assert.match(markup, /USD\/KRW/);
  assert.equal(markup.match(/market-reference-card market-signal-card/g)?.length, 2);
  assert.doesNotMatch(markup, /전국 평균 경유가|일일 평균 경유가|분기 평균 예상 유가 변화/);
});

test('market signal cards render the recent 30-day mini trend chart', () => {
  const support = {
    marketSignals: {
      status: 'ready',
      summaryText: '시장 흐름 요약',
      signals: [
        {
          indicatorCode: 'dubai',
          displayName: '두바이유',
          status: 'ready',
          latestObservationDate: '2026-08-27',
          previousObservationDate: '2026-08-26',
          collectedAt: '2026-08-28T00:00:00.000Z',
          value: 70.25,
          previousValue: 70,
          absoluteChange: 0.25,
          percentChange: 0.3571,
          direction: 'up',
          explanation: '두바이유 흐름',
          unitLabel: 'USD/BBL',
          valueBasisLabel: '일별 종가',
          providerName: '오피넷',
          sourceUrl: 'https://example.com/dubai',
          trendWindowDays: 30,
          history: [
            { observedAt: '2026-07-30T00:00:00.000Z', value: 69.1 },
            { observedAt: '2026-08-13T00:00:00.000Z', value: 69.8 },
            { observedAt: '2026-08-27T00:00:00.000Z', value: 70.25 },
          ],
        },
        {
          indicatorCode: 'usd-krw',
          displayName: 'USD/KRW',
          status: 'ready',
          latestObservationDate: '2026-08-27',
          previousObservationDate: '2026-08-26',
          collectedAt: '2026-08-28T00:00:00.000Z',
          value: 1325.4,
          previousValue: 1324.8,
          absoluteChange: 0.6,
          percentChange: 0.0453,
          direction: 'down',
          explanation: '환율 흐름',
          unitLabel: '원/USD',
          valueBasisLabel: '일별 기준환율',
          providerName: 'ECB',
          sourceUrl: 'https://example.com/usd-krw',
          trendWindowDays: 30,
          history: [{ observedAt: '2026-08-27T00:00:00.000Z', value: 1325.4 }],
        },
      ],
    },
  } as FscDashboardSupportSection;
  const markup = renderToStaticMarkup(createElement(MarketReferencePanel, { support }));

  assert.match(markup, /최근 30일/);
  assert.match(markup, /market-trend-chart__svg market-trend-chart__svg--up/);
  assert.match(markup, /market-trend-chart__line/);
  assert.match(markup, /70\.25<\/text>/);
  assert.match(markup, /추세 데이터 준비 중/);
  assert.equal(markup.match(/market-trend-chart__line/g)?.length, 1);
});
