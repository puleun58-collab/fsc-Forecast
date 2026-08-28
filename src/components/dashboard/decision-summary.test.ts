import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { EstimatedFscRateCard } from './decision-summary';
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
