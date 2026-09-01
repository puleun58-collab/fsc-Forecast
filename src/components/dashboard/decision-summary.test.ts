import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BaselinePriceControl } from './baseline-price-control';
import { DecisionSummary, EstimatedFscRateCard } from './decision-summary';
import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('estimated FSC card presents only the 30 percent oil-weighted rate', () => {
  const markup = renderToStaticMarkup(
    createElement(EstimatedFscRateCard, {
      fsc: {
        diffRatio: '0.232000',
        oilWeightRate: '0.3000',
      },
    }),
  );

  assert.match(markup, /Estimated FSC Rate/);
  assert.match(markup, /다음 분기 예상 FSC율/);
  assert.match(markup, /유가 비중 30% 적용/);
  assert.match(markup, /\+6\.96%/);
  assert.match(markup, /예상 FSC율 = 기준유가 대비 증감률 × 유가 비중 30%/);
  assert.doesNotMatch(markup, /Derived FSC Result|분기 예상 유가 기반 FSC 결과|70%|원\/L/);
});

test('decision summary renders the ordered four-card flow with one shared baseline', () => {
  const fsc = {
    basePriceKrwPerL: '1500.00',
    quarterAverageKrwPerL: '1845.24',
    diffRatio: '0.230157',
    oilWeightRate: '0.3000',
    weeks: [
      {
        sequenceNo: 8,
        priceKind: 'actual',
        priceKrwPerL: '1845.67',
        weekStartDate: '2026-08-16T00:00:00.000Z',
        weekEndDate: '2026-08-20T00:00:00.000Z',
      },
      {
        sequenceNo: 9,
        priceKind: 'actual',
        priceKrwPerL: '1845.23',
        weekStartDate: '2026-08-23T00:00:00.000Z',
        weekEndDate: '2026-08-27T00:00:00.000Z',
      },
    ],
  } as FscDashboardResultSection;
  const markup = renderToStaticMarkup(
    createElement(DecisionSummary, {
      fsc,
      currentPrice: {
        availability: 'available',
        latestPriceDate: '2026-08-27',
        latestPriceKrwPerL: 1844.94,
        previousPriceDate: '2026-08-26',
        previousPriceKrwPerL: 1845.28,
        absoluteChangeKrwPerL: -0.34,
        percentChange: -0.0184,
        direction: 'down',
        coverageStartDate: '2026-07-01',
        coverageEndDate: '2026-08-27',
        sourceObservedAt: '2026-08-27T18:17:44.467Z',
      },
      quarter: {
        targetYear: 2026,
        targetQuarter: 3,
        referenceYear: 2026,
        referenceQuarter: 2,
        quarterStartDate: '2026-07-01T00:00:00.000Z',
        quarterEndDate: '2026-09-30T00:00:00.000Z',
        status: 'active',
        isActive: true,
      },
      isActiveQuarterSelected: true,
    }),
  );
  const titles = [
    '전국 평균 경유가',
    '8월 4주차 평균 유가',
    '분기 평균 예상 유가',
    '다음 분기 예상 FSC율',
  ];
  const titlePositions = titles.map((title) => markup.indexOf(title));

  assert.equal(titlePositions.every((position) => position >= 0), true);
  assert.deepEqual(titlePositions, [...titlePositions].sort((left, right) => left - right));
  assert.match(markup, /기준유가 대비 \+344\.94원 · \+23\.00% ↑/);
  assert.match(markup, /기준유가 대비 \+345\.23원 · \+23\.02% ↑/);
  assert.match(markup, /기준유가 대비 \+345\.24원 · \+23\.02% ↑/);
  assert.equal(markup.match(/summary-card__baseline/g)?.length, 3);
  assert.doesNotMatch(markup, /scenario-price-input|기준유가 설정|수집 시각/);
});

test('historical summary reuses the active card titles with official Opinet week data', () => {
  const fsc = {
    basePriceKrwPerL: '1500.00',
    quarterAverageKrwPerL: '1994.65',
    quarterAverageBasisKind: 'official_quarterly',
    diffRatio: '0.329767',
    oilWeightRate: '0.3000',
    weeks: [
      {
        sequenceNo: 12,
        priceKind: 'actual',
        priceKrwPerL: '2004.14',
        weekStartDate: '2026-06-14T00:00:00.000Z',
        weekEndDate: '2026-06-18T00:00:00.000Z',
        officialWeekLabel: '2026년06월3주',
      },
      {
        sequenceNo: 13,
        priceKind: 'actual',
        priceKrwPerL: '2001.30',
        weekStartDate: '2026-06-21T00:00:00.000Z',
        weekEndDate: '2026-06-25T00:00:00.000Z',
        officialWeekLabel: '2026년06월4주',
      },
    ],
  } as FscDashboardResultSection;
  const markup = renderToStaticMarkup(
    createElement(DecisionSummary, {
      fsc,
      currentPrice: {
        availability: 'unavailable',
        latestPriceDate: null,
        latestPriceKrwPerL: null,
        previousPriceDate: null,
        previousPriceKrwPerL: null,
        absoluteChangeKrwPerL: null,
        percentChange: null,
        direction: 'flat',
        coverageStartDate: '2026-04-01',
        coverageEndDate: '2026-06-30',
        sourceObservedAt: null,
        unavailableReason: '선택한 분기 내 일별 Actual 데이터가 없습니다.',
      },
      quarter: {
        targetYear: 2026,
        targetQuarter: 2,
        referenceYear: 2026,
        referenceQuarter: 1,
        quarterStartDate: '2026-04-01T00:00:00.000Z',
        quarterEndDate: '2026-06-30T00:00:00.000Z',
        status: 'closed',
        isActive: false,
      },
      isActiveQuarterSelected: false,
    }),
  );

  assert.match(markup, /전국 평균 경유가/);
  assert.match(markup, /6월 4주차 평균 유가/);
  assert.match(markup, /2026\.06\.21–2026\.06\.25/);
  assert.match(markup, /2,001\.30/);
  assert.match(markup, /2분기 평균 유가/);
  assert.match(markup, /오피넷 공식 분기 평균/);
  assert.match(markup, /3분기 산출 FSC율/);
  assert.match(markup, /산출 FSC율 = 기준유가 대비 증감률/);
  assert.doesNotMatch(
    markup,
    /분기 말|마지막 주|분기 평균 예상 유가|Actual과 주간 Forecast 기준|Actual 기준|다음 분기 예상 FSC율/,
  );
});

test('baseline control renders as a compact input-only card', () => {
  const markup = renderToStaticMarkup(
    createElement(BaselinePriceControl, {
      priceInput: '1500.00',
      inputError: null,
      isPriceModified: false,
      onPriceChange: () => undefined,
      onPriceReset: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="기준유가 설정"/);
  assert.match(markup, />기준유가<\/label>/);
  assert.match(markup, /id="scenario-price-input"/);
  assert.match(markup, /초기화/);
  assert.doesNotMatch(markup, /공통 계산 기준|4개 카드에 즉시 반영|기준유가 설정<\/h2>/);
  assert.doesNotMatch(markup, /scenario-price-help|surface-panel/);
});

test('compact baseline toolbar keeps validation feedback inline', () => {
  const markup = renderToStaticMarkup(
    createElement(BaselinePriceControl, {
      priceInput: '',
      inputError: '기준유가를 입력해 주세요.',
      isPriceModified: false,
      onPriceChange: () => undefined,
      onPriceReset: () => undefined,
    }),
  );

  assert.match(markup, /price-input--error/);
  assert.match(markup, /price-input__help price-input__help--error/);
  assert.match(markup, /기준유가를 입력해 주세요/);
});
