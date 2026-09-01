import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminQuarterManagement, type AdminQuarterSummary } from './admin-quarter-management';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const QUARTERS: AdminQuarterSummary[] = [
  {
    id: 'q-2026-4',
    targetYear: 2026,
    targetQuarter: 4,
    label: '2026년 4분기',
    referenceLabel: '2026년 3분기',
    status: 'draft',
    isActive: false,
  },
  {
    id: 'q-2026-3',
    targetYear: 2026,
    targetQuarter: 3,
    label: '2026년 3분기',
    referenceLabel: '2026년 2분기',
    status: 'active',
    isActive: true,
  },
  {
    id: 'q-2026-2',
    targetYear: 2026,
    targetQuarter: 2,
    label: '2026년 2분기',
    referenceLabel: '2026년 1분기',
    status: 'closed',
    isActive: false,
  },
];

test('quarter management leads with the operating quarter and the next prepared quarter', () => {
  const markup = renderToStaticMarkup(createElement(AdminQuarterManagement, { quarters: QUARTERS }));
  const pastStart = markup.indexOf('<details');
  const leadBlock = markup.slice(0, pastStart);

  assert.match(markup, /분기 관리/);
  assert.match(markup, /현재 운영 분기와 다음 준비 분기를 관리합니다/);
  assert.match(markup, /다음 준비 분기 2026년 4분기/);
  assert.match(leadBlock, /2026년 3분기.*<span class="status-tag status-tag--ok">운영 중<\/span>/s);
  assert.match(leadBlock, /2026년 4분기.*<span class="status-tag status-tag--warning">준비<\/span>/s);
  assert.match(leadBlock, /참조 분기 2026년 2분기/);
  assert.doesNotMatch(leadBlock, /2026년 2분기<\/strong>/);
  assert.doesNotMatch(markup, /ACTIVE|draft|Quarter 목록|특정 quarter 활성화/);
});

test('only the prepared quarter exposes the activation action', () => {
  const markup = renderToStaticMarkup(createElement(AdminQuarterManagement, { quarters: QUARTERS }));

  assert.equal(markup.match(/운영 분기로 전환/g)?.length, 1);
  assert.match(markup, /<button type="button" class="button button--secondary">운영 분기로 전환<\/button>/);
});

test('past quarters stay collapsed behind one shared disclosure', () => {
  const markup = renderToStaticMarkup(createElement(AdminQuarterManagement, { quarters: QUARTERS }));
  const detailsStart = markup.indexOf('<details class="admin-panel admin-disclosure">');

  assert.ok(detailsStart > 0);
  assert.doesNotMatch(markup.slice(detailsStart, detailsStart + 60), /\sopen(?:=|>|\s)/);
  assert.match(markup.slice(detailsStart), /<strong>지난 분기<\/strong>/);
  assert.match(markup.slice(detailsStart), /상세 보기 ▾/);
  assert.match(markup.slice(detailsStart), /<span class="status-tag">완료<\/span>/);
});

test('the nearest future draft becomes the next quarter and later drafts get their own section', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminQuarterManagement, {
      quarters: [
        {
          id: 'q-2027-1',
          targetYear: 2027,
          targetQuarter: 1,
          label: '2027년 1분기',
          referenceLabel: '2026년 4분기',
          status: 'draft',
          isActive: false,
        },
        ...QUARTERS,
      ],
    }),
  );
  const laterStart = markup.indexOf('이후 준비 분기');
  const pastStart = markup.indexOf('지난 분기');
  const leadBlock = markup.slice(0, markup.indexOf('<details'));
  const laterBlock = markup.slice(laterStart, pastStart);
  const pastBlock = markup.slice(pastStart);

  assert.match(markup, /다음 준비 분기 2026년 4분기/);
  assert.match(leadBlock, /<strong>2026년 3분기<\/strong>/);
  assert.match(leadBlock, /<strong>2026년 4분기<\/strong>/);
  assert.doesNotMatch(leadBlock, /2027년 1분기/);
  assert.ok(laterStart > 0 && pastStart > laterStart);
  assert.match(laterBlock, /<strong>2027년 1분기<\/strong>/);
  assert.doesNotMatch(pastBlock, /2027년 1분기/);
  assert.match(pastBlock, /<strong>2026년 2분기<\/strong>/);
  assert.equal(markup.match(/운영 분기로 전환/g)?.length, 1);
});

test('past quarters are listed newest first and exclude every future draft', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminQuarterManagement, {
      quarters: [
        QUARTERS[1]!,
        QUARTERS[2]!,
        {
          id: 'q-2026-1',
          targetYear: 2026,
          targetQuarter: 1,
          label: '2026년 1분기',
          referenceLabel: '2025년 4분기',
          status: 'closed',
          isActive: false,
        },
        {
          id: 'q-2025-4',
          targetYear: 2025,
          targetQuarter: 4,
          label: '2025년 4분기',
          referenceLabel: '2025년 3분기',
          status: 'draft',
          isActive: false,
        },
      ],
    }),
  );
  const pastBlock = markup.slice(markup.indexOf('지난 분기'));
  const order = [...pastBlock.matchAll(/<strong>(20\d\d년 \d분기)<\/strong>/g)].map((match) => match[1]);

  assert.deepEqual(order, ['2026년 2분기', '2026년 1분기', '2025년 4분기']);
  assert.match(markup, /다음 준비 분기가 없습니다/);
  assert.doesNotMatch(markup, /운영 분기로 전환/);
  assert.doesNotMatch(markup, /이후 준비 분기/);
});

test('missing quarters fall back to short explanations instead of empty rows', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminQuarterManagement, { quarters: [QUARTERS[1]!] }),
  );

  assert.match(markup, /준비 분기 없음/);
  assert.match(markup, /다음 준비 분기가 없습니다/);
  assert.doesNotMatch(markup, /지난 분기/);
  assert.doesNotMatch(markup, /운영 분기로 전환/);
});
