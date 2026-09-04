import assert from 'node:assert/strict';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminTuningTimeline } from './admin-tuning-timeline';
import { FALLBACK_FORECAST_MODEL_PARAMS } from '@/lib/forecast/forecast-model-config';
import type { TuningTimelineEvent } from '@/lib/forecast/tuning-timeline';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const CAP_CANDIDATE = { ...FALLBACK_FORECAST_MODEL_PARAMS, externalAdjustmentCapRatio: 0.01 };
const TREND_CANDIDATE = { ...FALLBACK_FORECAST_MODEL_PARAMS, trendLookbackWeeks: 6 };

function event(overrides: Partial<TuningTimelineEvent> = {}): TuningTimelineEvent {
  return {
    type: 'candidate-started',
    weekEndDate: '2026-09-03T00:00:00.000Z',
    occurredAt: '2026-09-03T01:00:00.000Z',
    candidateParams: CAP_CANDIDATE,
    previousCandidateParams: null,
    confirmedCount: 1,
    requiredCount: 2,
    shadowSampleCount: null,
    shadowRequiredSampleCount: null,
    shadowMaeKrwPerL: null,
    ...overrides,
  };
}

function render(events: readonly TuningTimelineEvent[]): string {
  return renderToStaticMarkup(createElement(AdminTuningTimeline, { events }));
}

test('the history stays collapsed and explains an empty legacy state', () => {
  const markup = render([]);

  assert.match(markup, /튜닝 진행 이력/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /이 기능 적용 이전 기록이라 남아 있는 튜닝 이력이 없습니다/);
  assert.match(
    markup,
    /주차별 1순위 튜닝 후보의 변경 이력입니다\. 현재 운영 설정 변경 이력이 아닙니다\./,
  );
});

test('each event states its week, title and candidate', () => {
  const markup = render([event()]);

  assert.match(markup, /9월 1주차/);
  assert.match(markup, /1순위 후보 확인 시작/);
  assert.match(markup, /외부 보정 상한 ±1%/);
  assert.match(markup, /동일 후보 확인 1\/2주/);
  assert.doesNotMatch(markup, /Trend |Lag |Weight |Cap ±|현재<\/span>/);
});

test('only the newest event is labelled as this week rank one', () => {
  const markup = render([
    event({ type: 'shadow-progress', shadowSampleCount: 4, shadowRequiredSampleCount: 13, shadowMaeKrwPerL: 19.2 }),
    event({ occurredAt: '2026-08-27T01:00:00.000Z' }),
  ]);

  assert.equal(markup.match(/status-tag--accent">이번 주 1순위/g)?.length, 1);
  assert.equal(markup.match(/status-tag--accent">당시 1순위/g)?.length, 1);
  assert.equal(markup.match(/tuning-timeline__item--current/g)?.length, 1);
  assert.match(markup, /Shadow 4\/13주 · 누적 MAE 19\.20원\/L/);
});

test('a candidate change shows the setting it replaced', () => {
  const markup = render([
    event({
      type: 'candidate-changed',
      candidateParams: TREND_CANDIDATE,
      previousCandidateParams: CAP_CANDIDATE,
    }),
  ]);

  assert.match(markup, /1순위 후보가 변경됨/);
  assert.match(markup, /이전 주 1순위 · .*외부 보정 상한 ±1%/);
  assert.match(markup, /추세 기간 6주/);
});

test('operational transitions continue the same list', () => {
  const markup = render([
    event({ type: 'transition-rolled-back', weekEndDate: null, confirmedCount: null, requiredCount: null }),
    event({ type: 'transition-applied', weekEndDate: null, confirmedCount: null, requiredCount: null }),
    event({ type: 'shadow-completed', shadowSampleCount: 13, shadowRequiredSampleCount: 13, shadowMaeKrwPerL: 18.4 }),
  ]);

  assert.match(markup, /운영 설정 롤백/);
  assert.match(markup, /운영 모델 적용/);
  assert.match(markup, /Shadow 검증 완료/);
  assert.match(markup, /주차 정보 없음/);
});
