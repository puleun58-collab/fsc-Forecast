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

function stages(current: 'candidate' | 'shadow' | 'transition'): OperationsStatusCenter['stages'] {
  return [
    { key: 'candidate', label: '후보 확인 1/2', current: current === 'candidate' },
    { key: 'shadow', label: current === 'candidate' ? 'Shadow 대기' : 'Shadow 5/13', current: current === 'shadow' },
    {
      key: 'transition',
      label: current === 'transition' ? '운영 전환 검토' : '운영 전환 대기',
      current: current === 'transition',
    },
  ];
}

function center(overrides: Partial<OperationsStatusCenter> = {}): OperationsStatusCenter {
  return {
    status: 'healthy',
    primaryAction: null,
    items: [],
    observations: [],
    stages: stages('candidate'),
    ...overrides,
  };
}

function render(value: OperationsStatusCenter): string {
  return renderToStaticMarkup(createElement(AdminOperationsStatus, { center: value }));
}

test('a healthy run stays compact and lists nothing to check', () => {
  const markup = render(center());

  assert.match(markup, /Forecast 운영 상태/);
  assert.match(markup, /정상/);
  assert.match(markup, /현재 즉시 확인할 항목이 없습니다/);
  assert.doesNotMatch(markup, /가장 먼저 확인/);
  assert.doesNotMatch(markup, /전체 상태 보기/);
});

test('a single observation is shown once without the collapsed list', () => {
  const observation = item({
    key: 'candidate-persistence',
    severity: 'watch',
    title: '1순위 후보 확인 1/2주',
    detail: 'Trend 8주 · Dubai 2주 / 5% · 같은 후보가 한 번 더 통과하면 Shadow 검증을 시작합니다.',
    source: 'tuning',
  });
  const markup = render(center({ status: 'watch', observations: [observation] }));

  assert.equal(markup.match(/1순위 후보 확인 1\/2주/g)?.length, 1);
  assert.doesNotMatch(markup, /전체 상태 보기/);
  assert.doesNotMatch(markup, /진행 중인 검증과 관찰 항목이 있습니다/);
  assert.doesNotMatch(markup, /현재 단계 ·/);
});

test('only one primary action is highlighted and never repeated', () => {
  const primary = item({ key: 'rollback', severity: 'action-required', title: 'Rollback 검토 필요' });
  const markup = render(
    center({ status: 'action-required', primaryAction: primary, items: [primary, item()] }),
  );

  assert.equal(markup.match(/가장 먼저 확인/g)?.length, 1);
  assert.equal(markup.match(/Rollback 검토 필요/g)?.length, 1);
  assert.match(markup, /입력 데이터 확인 필요/);
});

test('extra items and observations move behind the full-state disclosure', () => {
  const markup = render(
    center({
      status: 'attention',
      primaryAction: item(),
      items: [
        item(),
        item({ key: 'a', title: '항목 A' }),
        item({ key: 'b', title: '항목 B' }),
        item({ key: 'c', title: '항목 C' }),
        item({ key: 'd', title: '항목 D' }),
      ],
      observations: [item({ key: 'shadow', severity: 'watch', title: 'Shadow 검증 5/13주', source: 'shadow' })],
    }),
  );
  const disclosureStart = markup.indexOf('전체 상태 보기');

  assert.ok(disclosureStart > 0);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.ok(markup.indexOf('항목 D') > disclosureStart);
  assert.ok(markup.indexOf('Shadow 검증 5/13주') > disclosureStart);
});

test('the flow marks only the current stage', () => {
  const candidate = render(center({ status: 'watch' }));
  const shadow = render(center({ status: 'watch', stages: stages('shadow') }));
  const transition = render(center({ status: 'action-required', stages: stages('transition') }));

  assert.match(candidate, /operations-status__stage--current">후보 확인 1\/2</);
  assert.match(shadow, /operations-status__stage--current">Shadow 5\/13</);
  assert.match(transition, /operations-status__stage--current">운영 전환 검토</);
  assert.equal(candidate.match(/operations-status__stage--current/g)?.length, 1);
});

test('a project without forecast runs says so instead of warning', () => {
  const markup = render(center({ status: 'unknown', stages: [] }));

  assert.match(markup, /판단 전/);
  assert.match(markup, /예측 실행 기록이 없습니다/);
  assert.doesNotMatch(markup, /operations-status__stages/);
});
