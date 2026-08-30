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
        fscLowRate: '0.3000',
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
    fscLowRate: '0.3000',
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
    }),
  );
  const titles = [
    '일일 평균 경유가',
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
  assert.doesNotMatch(markup, /scenario-price-input|기준유가 설정/);
});

test('baseline control is a standalone shared setting above the cards', () => {
  const markup = renderToStaticMarkup(
    createElement(BaselinePriceControl, {
      priceInput: '1500.00',
      inputError: null,
      isPriceModified: false,
      onPriceChange: () => undefined,
      onPriceReset: () => undefined,
    }),
  );

  assert.match(markup, /공통 계산 기준/);
  assert.match(markup, /기준유가 설정/);
  assert.match(markup, /4개 핵심 카드의 공통 계산 기준입니다/);
  assert.match(markup, /변경하면 아래 4개 핵심 카드에 즉시 반영됩니다/);
  assert.match(markup, /id="scenario-price-input"/);
});
