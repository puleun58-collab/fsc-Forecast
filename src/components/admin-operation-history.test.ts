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
  assert.match(markup, /최근 데이터 수집 및 Forecast\/FSC 실행 흐름입니다/);
  assert.match(markup, /최근 3건/);
  assert.match(markup, /2026\.09\.01 16:20 KST/);
  assert.match(markup, /<span class="status-tag status-tag--ok">성공<\/span>/);
  assert.match(markup, /<span class="status-tag status-tag--critical">실패<\/span>/);
  assert.match(markup, /<span class="status-tag status-tag--warning">진행 중<\/span>/);
  assert.match(markup, /2026년 3분기 · \+7\.03%/);
  assert.match(markup, /<dt>직전 결과 대비<\/dt><dd>\+0\.21%p<\/dd>/);
  assert.match(markup, /오류 사유<\/span><strong>Forecast pipeline 실행이 실패했습니다\.<\/strong>/);
  assert.doesNotMatch(markup, /fsc-1|forecast-failed|ingest-running/);
});

test('each expanded detail is a full-width panel that follows its own row', () => {
  const markup = renderToStaticMarkup(createElement(AdminOperationHistory, { events: EVENTS }));
  const items = [...markup.matchAll(/<li class="operation-history-item[^"]*">(.*?)<\/li>/gs)].map(
    (match) => match[1] ?? '',
  );

  assert.equal(items.length, 3);

  for (const item of items) {
    const rowEnd = item.indexOf('</summary>');
    const detailStart = item.indexOf('<div class="operation-history-detail">');

    assert.match(item, /<details class="operation-history-entry">/);
    assert.ok(rowEnd > 0 && detailStart > rowEnd);
    assert.equal(item.match(/보기 ▾/g)?.length, 1);
    assert.equal(item.match(/접기 ▴/g)?.length, 1);
    assert.doesNotMatch(item.slice(0, rowEnd), /operation-history-detail/);
  }

  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
});

test('an event without details renders a plain row and no toggle', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminOperationHistory, {
      events: [{ ...EVENTS[0]!, details: [], errorMessage: null }, EVENTS[1]!],
    }),
  );

  assert.equal(markup.match(/<details class="operation-history-entry">/g)?.length, 1);
  assert.equal(markup.match(/보기 ▾/g)?.length, 1);
  assert.match(markup, /<li class="operation-history-item operation-history-item--success"><div class="operation-history-row">/);
});

test('an empty operation history explains how entries appear', () => {
  const markup = renderToStaticMarkup(createElement(AdminOperationHistory, { events: [] }));

  assert.match(markup, /아직 운영 이력이 없습니다/);
  assert.match(markup, /데이터 수집 또는 Forecast\/FSC 실행 후 이력이 표시됩니다/);
  assert.doesNotMatch(markup, /operation-history-row/);
});

test('only the five newest events stay visible and the rest move behind one disclosure', () => {
  const events: AdminOperationEvent[] = Array.from({ length: 8 }, (_, index) => ({
    ...EVENTS[2]!,
    id: `ingest:run-${index}`,
    summary: `수집 ${index}`,
    occurredAt: new Date(Date.UTC(2026, 8, 1, 12 - index)).toISOString(),
  }));
  const markup = renderToStaticMarkup(createElement(AdminOperationHistory, { events }));
  const disclosureStart = markup.indexOf('<details class="admin-disclosure admin-disclosure--inline">');
  const preview = markup.slice(0, disclosureStart);
  const rest = markup.slice(disclosureStart);

  assert.match(markup, /최근 8건/);
  assert.equal(preview.match(/<li class="operation-history-item /g)?.length, 5);
  assert.equal(rest.match(/<li class="operation-history-item /g)?.length, 3);
  assert.match(preview, /수집 4/);
  assert.doesNotMatch(preview, /수집 5/);
  assert.match(rest, /수집 7/);
  assert.match(rest, /<strong>전체 이력 8건<\/strong>/);
  assert.doesNotMatch(markup.slice(disclosureStart, disclosureStart + 70), /\sopen(?:=|>|\s)/);
  assert.equal(markup.match(/보기 ▾/g)?.length, 9);
});

test('five or fewer events render without the extra disclosure', () => {
  const markup = renderToStaticMarkup(createElement(AdminOperationHistory, { events: EVENTS }));

  assert.doesNotMatch(markup, /admin-disclosure--inline/);
  assert.doesNotMatch(markup, /전체 이력/);
});
