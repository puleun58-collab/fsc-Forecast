import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminOperationHistory } from './admin-operation-history';
import type { AdminOperationEvent } from '@/lib/admin-operation-history/admin-operation-history';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const EVENTS: AdminOperationEvent[] = [
  {
    id: 'fsc-recompute:fsc-1',
    type: 'fsc-recompute',
    label: 'FSC 재계산',
    occurredAt: '2026-09-01T07:20:00.000Z',
    status: 'success',
    summary: '2026년 3분기 · +7.03%',
    details: [
      { label: '분기 예상 평균', value: '1,851.37원/L' },
      { label: '직전 결과 대비', value: '+0.21%p' },
    ],
    errorMessage: null,
  },
  {
    id: 'forecast:forecast-failed',
    type: 'forecast',
    label: 'Forecast 실행',
    occurredAt: '2026-09-01T00:05:00.000Z',
    status: 'failed',
    summary: null,
    details: [],
    errorMessage: 'Forecast pipeline 실행이 실패했습니다.',
  },
  {
    id: 'ingest:ingest-running',
    type: 'ingest',
    label: '데이터 수집',
    occurredAt: '2026-08-31T02:00:00.000Z',
    status: 'running',
    summary: '오피넷 일별 경유가',
    details: [{ label: '실행 방식', value: '자동 실행' }],
    errorMessage: null,
  },
];

test('the operation history renders compact rows with KST times and status tags', () => {
  const markup = renderToStaticMarkup(createElement(AdminOperationHistory, { events: EVENTS }));

  assert.match(markup, /최근 운영 이력/);
  assert.match(markup, /데이터 수집부터 Forecast 및 FSC 처리까지 최근 실행 흐름을 확인합니다/);
  assert.match(markup, /최근 3건/);
  assert.match(markup, /2026\.09\.01 16:20 KST/);
  assert.match(markup, /<span class="status-tag status-tag--ok">성공<\/span>/);
  assert.match(markup, /<span class="status-tag status-tag--critical">실패<\/span>/);
  assert.match(markup, /<span class="status-tag status-tag--warning">진행 중<\/span>/);
  assert.match(markup, /2026년 3분기 · \+7\.03%/);
  assert.match(markup, /<dt>직전 결과 대비<\/dt><dd>\+0\.21%p<\/dd>/);
  assert.match(markup, /Forecast pipeline 실행이 실패했습니다/);
  assert.doesNotMatch(markup, /fsc-1|forecast-failed|ingest-running/);
});

test('details stay collapsed and are omitted when an event has nothing to expand', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminOperationHistory, {
      events: [{ ...EVENTS[0]!, details: [], errorMessage: null }, EVENTS[1]!],
    }),
  );

  assert.equal(markup.match(/<details class="operation-history-row__detail">/g)?.length, 1);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /상세 보기/);
});

test('an empty operation history explains how entries appear', () => {
  const markup = renderToStaticMarkup(createElement(AdminOperationHistory, { events: [] }));

  assert.match(markup, /아직 운영 이력이 없습니다/);
  assert.match(markup, /데이터 수집 또는 Forecast\/FSC 실행 후 이력이 표시됩니다/);
  assert.doesNotMatch(markup, /operation-history-row/);
});
