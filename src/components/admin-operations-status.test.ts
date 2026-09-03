import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminOperationsStatus } from './admin-operations-status';
import type {
  OperationsStatusCenter,
  OperationsStatusItem,
} from '@/lib/forecast/operations-status';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function item(overrides: Partial<OperationsStatusItem> = {}): OperationsStatusItem {
  return {
    key: 'input-quality',
    severity: 'attention',
    title: '입력 데이터 확인 필요',
    detail: 'Dubai 데이터 갱신 지연이 감지되었습니다.',
    source: 'input-quality',
    ...overrides,
  };
}

function render(center: OperationsStatusCenter, stageLabel: string | null = '1순위 후보 확인 중 · 1/2주') {
  return renderToStaticMarkup(createElement(AdminOperationsStatus, { center, stageLabel }));
}

test('a healthy run stays compact and lists nothing to check', () => {
  const markup = render({ status: 'healthy', primaryAction: null, items: [], observations: [] });

  assert.match(markup, /Forecast 운영 상태/);
  assert.match(markup, /정상/);
  assert.match(markup, /현재 즉시 확인할 항목이 없습니다/);
  assert.doesNotMatch(markup, /가장 먼저 확인/);
});

test('only one primary action is highlighted', () => {
  const primary = item({ key: 'rollback', severity: 'action-required', title: 'Rollback 검토 필요' });
  const markup = render({
    status: 'action-required',
    primaryAction: primary,
    items: [primary, item()],
    observations: [],
  });

  assert.equal(markup.match(/가장 먼저 확인/g)?.length, 1);
  assert.equal(markup.match(/Rollback 검토 필요/g)?.length, 1);
  assert.match(markup, /조치 필요/);
  assert.match(markup, /입력 데이터 확인 필요/);
});

test('items keep the order they were prioritised in', () => {
  const markup = render({
    status: 'attention',
    primaryAction: item(),
    items: [
      item(),
      item({ key: 'signal', title: '신호 확인', source: 'signal-review' }),
      item({ key: 'drift', title: '최근 Forecast 성능 악화', source: 'performance-drift' }),
    ],
    observations: [],
  });
  const first = markup.indexOf('신호 확인');
  const second = markup.indexOf('최근 Forecast 성능 악화');

  assert.ok(first > 0 && first < second);
});

test('extra items and observations move behind the full-state disclosure', () => {
  const markup = render({
    status: 'attention',
    primaryAction: item(),
    items: [
      item({ key: 'a', title: '항목 A' }),
      item({ key: 'b', title: '항목 B' }),
      item({ key: 'c', title: '항목 C' }),
      item({ key: 'd', title: '항목 D' }),
    ],
    observations: [item({ key: 'shadow', severity: 'watch', title: 'Shadow 검증 5/13주', source: 'shadow' })],
  });
  const disclosureStart = markup.indexOf('전체 상태 보기');

  assert.ok(disclosureStart > 0);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.ok(markup.indexOf('항목 D') > disclosureStart);
  assert.ok(markup.indexOf('Shadow 검증 5/13주') > disclosureStart);
});

test('the current tuning stage is reused, not recalculated', () => {
  const markup = render(
    { status: 'watch', primaryAction: null, items: [], observations: [] },
    'Shadow 검증 중 · 7/13주',
  );

  assert.match(markup, /현재 단계 · Shadow 검증 중 · 7\/13주/);
});

test('a project without forecast runs says so instead of warning', () => {
  const markup = render({ status: 'unknown', primaryAction: null, items: [], observations: [] }, null);

  assert.match(markup, /판단 전/);
  assert.match(markup, /예측 실행 기록이 없습니다/);
  assert.doesNotMatch(markup, /현재 단계/);
});
