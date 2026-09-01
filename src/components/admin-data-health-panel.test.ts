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

test('data health panel renders compact source rows and sanitized error details', () => {
  const markup = renderToStaticMarkup(createElement(AdminDataHealthPanel, { summary: SUMMARY }));

  assert.match(markup, /데이터 상태/);
  assert.match(markup, /확인 필요/);
  assert.match(markup, /오피넷 일별 경유가/);
  assert.match(markup, /오피넷 주간 경유가/);
  assert.match(markup, /Dubai/);
  assert.match(markup, /USD\/KRW/);
  assert.match(markup, /8월 3주차/);
  assert.match(markup, /2026\.09\.01 11:05 KST/);
  assert.match(markup, /<details class="data-health-row__error">/);
  assert.match(markup, /Dubai 데이터 수집 요청 실패/);
  assert.equal(markup.match(/오류 상세 보기/g)?.length, 1);
  assert.doesNotMatch(markup, /DATABASE_URL|ADMIN_SESSION_SECRET|API[_ -]?KEY|stack/i);
});
