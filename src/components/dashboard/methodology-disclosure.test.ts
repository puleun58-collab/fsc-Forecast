import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MethodologyDisclosure } from './methodology-disclosure';
import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const FSC = {
  dataBasisAt: '2026-09-03T00:00:00.000Z',
  forecastCompletedAt: '2026-09-03T01:00:00.000Z',
  createdAt: '2026-09-03T01:05:00.000Z',
  approvedAt: null,
  dataDelayMinutes: 30,
} as FscDashboardResultSection;

test('the public policy disclosure states the applied principles in plain wording', () => {
  const markup = renderToStaticMarkup(createElement(MethodologyDisclosure, { fsc: FSC }));

  assert.match(markup, /산출 기준 및 데이터 정책/);
  assert.match(markup, /Actual 값이 있는 완료 주차는 Forecast 값으로 덮어쓰지 않습니다\./);
  assert.match(markup, /<h3>적용 원칙<\/h3>/);
  assert.match(markup, /Forecast 값에는 최근 주간 경유가 추세와 현재 운영 설정의 보조 신호를 반영합니다\./);
  assert.match(markup, /데이터가 갱신되면 Forecast 값과 FSC 결과를 다시 산출합니다\./);
  assert.doesNotMatch(markup, /산출 정책/);
  assert.doesNotMatch(markup, /Forecast로 덮어쓰지 않습니다/);
});

test('the disclosure keeps the processing timeline with the pending approval state', () => {
  const markup = renderToStaticMarkup(createElement(MethodologyDisclosure, { fsc: FSC }));

  assert.match(markup, /데이터 처리 시각/);
  assert.match(markup, /<dt>승인 완료<\/dt><dd>승인 대기<\/dd>/);
});
