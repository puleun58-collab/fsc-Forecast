import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDataHealthPanel } from './admin-data-health-panel';
import type { DataHealthSummary } from '@/lib/data-health/data-health';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const SUMMARY: DataHealthSummary = {
  status: 'error',
  label: '확인 필요',
  items: [
    {
      sourceCode: 'opinet-daily',
      source: '오피넷 일별 경유가',
      status: 'healthy',
      latestDataAt: '2026-09-01T00:00:00.000Z',
      latestDataLabel: null,
      lastCollectedAt: '2026-09-01T02:05:00.000Z',
      expectedLatestDate: '2026-09-01',
      delayLabel: null,
      errorAt: null,
      errorMessage: null,
    },
    {
      sourceCode: 'opinet-weekly',
      source: '오피넷 주간 경유가',
      status: 'delayed',
      latestDataAt: '2026-08-20T00:00:00.000Z',
      latestDataLabel: '8월 3주차',
      lastCollectedAt: '2026-08-25T02:30:00.000Z',
      expectedLatestDate: '2026-08-27',
      delayLabel: '1주차 지연',
      errorAt: null,
      errorMessage: null,
    },
    {
      sourceCode: 'dubai',
      source: 'Dubai',
      status: 'error',
      latestDataAt: '2026-08-28T00:00:00.000Z',
      latestDataLabel: null,
      lastCollectedAt: '2026-09-01T01:58:00.000Z',
      expectedLatestDate: '2026-08-28',
      delayLabel: null,
      errorAt: '2026-09-01T02:00:00.000Z',
      errorMessage: 'Dubai 데이터 수집 요청 실패',
    },
    {
      sourceCode: 'usd-krw',
      source: 'USD/KRW',
      status: 'missing',
      latestDataAt: null,
      latestDataLabel: null,
      lastCollectedAt: null,
      expectedLatestDate: '2026-08-31',
      delayLabel: null,
      errorAt: null,
      errorMessage: null,
    },
  ],
};

test('data health renders one compact table with column headers instead of repeated labels', () => {
  const markup = renderToStaticMarkup(createElement(AdminDataHealthPanel, { summary: SUMMARY }));
  const headEnd = markup.indexOf('</thead>');
  const head = markup.slice(0, headEnd);
  const body = markup.slice(headEnd);

  assert.match(markup, /데이터 상태/);
  assert.match(markup, /확인 필요/);
  assert.match(markup, /Forecast 입력 데이터의 최신 상태를 확인합니다/);
  assert.match(head, /<th scope="col">데이터 소스<\/th><th scope="col">상태<\/th><th scope="col">최신 데이터<\/th><th scope="col">최근 성공 수집<\/th>/);
  assert.equal(markup.match(/최근 성공 수집/g)?.length, 5);
  assert.equal(markup.match(/최신 데이터/g)?.length, 5);
  assert.match(body, /<th scope="row" data-label="데이터 소스">오피넷 일별 경유가<\/th>/);
  assert.match(body, /<span class="status-tag status-tag--ok">최신<\/span>/);
  assert.match(body, /<span class="status-tag status-tag--warning">지연<\/span>/);
  assert.match(body, /<span class="status-tag status-tag--critical">오류<\/span>/);
  assert.match(body, /<span class="status-tag">데이터 없음<\/span>/);
  assert.match(body, /8월 3주차/);
  assert.match(body, /2026\.09\.01 11:05 KST/);
  assert.match(body, /1주차 지연/);
  assert.doesNotMatch(markup, /정상/);
});

test('only the failed source exposes a sanitized error disclosure', () => {
  const markup = renderToStaticMarkup(createElement(AdminDataHealthPanel, { summary: SUMMARY }));
  const errorStart = markup.indexOf('<details class="data-health-table__error">');

  assert.ok(errorStart > 0);
  assert.equal(markup.match(/data-health-table__error/g)?.length, 1);
  assert.doesNotMatch(markup.slice(errorStart, errorStart + 60), /\sopen(?:=|>|\s)/);
  assert.match(markup, /Dubai 데이터 수집 요청 실패/);
  assert.match(markup, /최근 오류 2026\.09\.01 11:00 KST/);
  assert.doesNotMatch(markup, /DATABASE_URL|ADMIN_SESSION_SECRET|API[_ -]?KEY|stack/i);
});
