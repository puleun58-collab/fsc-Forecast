import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminSectionNavigation } from './admin-section-navigation';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('the admin section navigation exposes four native anchor shortcuts', () => {
  const markup = renderToStaticMarkup(createElement(AdminSectionNavigation));

  assert.match(markup, /<nav class="admin-section-nav" aria-label="관리자 페이지 영역 바로가기">/);
  assert.match(markup, /href="#operations"[^>]*>운영 현황<\/a>/);
  assert.match(markup, /href="#diagnostics"[^>]*>예측 품질·진단<\/a>/);
  assert.match(markup, /href="#tuning"[^>]*>튜닝·검증<\/a>/);
  assert.match(markup, /href="#management"[^>]*>관리·이력<\/a>/);
  assert.equal(markup.match(/class="admin-section-nav__link"/g)?.length, 4);
  assert.doesNotMatch(markup, /<button/);
});

test('the hashless server view marks operations as the initial location', () => {
  const markup = renderToStaticMarkup(createElement(AdminSectionNavigation));

  assert.match(markup, /href="#operations" aria-current="location"/);
  assert.equal(markup.match(/aria-current="location"/g)?.length, 1);
});
