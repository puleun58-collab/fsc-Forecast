import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminSectionNavigation } from './admin-section-navigation';
import { scheduleHashTargetRelease } from './admin-section-navigation-state';

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

test('reselecting the current hash replaces its release timer and always resumes scroll tracking', () => {
  const scheduled = new Map<number, () => void>();
  const cancelled: number[] = [];
  let nextTimer = 1;
  let releaseCount = 0;
  const timers = {
    schedule(callback: () => void, delayMs: number): number {
      assert.equal(delayMs, 1_600);
      const timer = nextTimer;
      nextTimer += 1;
      scheduled.set(timer, callback);
      return timer;
    },
    cancel(timer: number): void {
      cancelled.push(timer);
      scheduled.delete(timer);
    },
  };

  const firstTimer = scheduleHashTargetRelease(null, () => {
    releaseCount += 1;
  }, timers);
  const repeatedTimer = scheduleHashTargetRelease(firstTimer, () => {
    releaseCount += 1;
  }, timers);

  assert.deepEqual(cancelled, [firstTimer]);
  assert.equal(scheduled.has(firstTimer), false);
  assert.equal(scheduled.size, 1);
  scheduled.get(repeatedTimer)?.();
  assert.equal(releaseCount, 1);
});
