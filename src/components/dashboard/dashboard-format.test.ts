import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateWeekOverWeekChange,
  formatWeekRange,
  formatWeekOverWeekChange,
  mapReliabilityStatus,
  RELIABILITY_POLICY_ITEMS,
} from './dashboard-format';

import type { FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

const JULY_FIRST_WEEK: FscDashboardWeekItem = {
  sequenceNo: 1,
  targetMonth: 7,
  weekNo: 27,
  weekStartDate: '2026-07-01T00:00:00.000Z',
  weekEndDate: '2026-07-02T00:00:00.000Z',
  officialWeekLabel: null,
  priceKind: 'actual',
  priceKrwPerL: '0',
  actualPriceKrwPerL: '0',
  forecastPriceKrwPerL: null,
  forecastLowerBoundKrwPerL: null,
  forecastUpperBoundKrwPerL: null,
  forecastSourceKind: null,
  fallbackUsed: false,
  priceDiffKrwPerL: '0',
  diffRatio: '0',
};

test('week display restores the full Opinet period at a quarter boundary', () => {
  assert.equal(formatWeekRange(JULY_FIRST_WEEK), '2026.06.28–2026.07.02');
  assert.equal(formatWeekRange(JULY_FIRST_WEEK, true), '6.28–7.2');
});

test('mapReliabilityStatus distinguishes pre-sample, in-progress, and graded states', () => {
  assert.deepEqual(
    mapReliabilityStatus({
      grade: 'U',
      sampleCount: 0,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: null,
    }),
    {
      label: '신뢰도 산정 전',
      shortLabel: '산정 전',
      detail: '비교 가능한 완료 예측이 아직 없습니다.',
      tone: 'neutral',
    },
  );

  assert.deepEqual(
    mapReliabilityStatus({
      grade: 'U',
      sampleCount: 1,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: 1.0,
    }),
    {
      label: '신뢰도 산정 중 · 1/13',
      shortLabel: '산정 중 · 1/13',
      detail: '공식 신뢰도 등급은 주간 백테스트 13개가 확보된 후 산정합니다. 현재 1개가 확보되었습니다.',
      tone: 'neutral',
    },
  );

  assert.deepEqual(
    mapReliabilityStatus({
      grade: 'U',
      sampleCount: 12,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: 2.0,
    }),
    {
      label: '신뢰도 산정 중 · 12/13',
      shortLabel: '산정 중 · 12/13',
      detail: '공식 신뢰도 등급은 주간 백테스트 13개가 확보된 후 산정합니다. 현재 12개가 확보되었습니다.',
      tone: 'neutral',
    },
  );

  assert.deepEqual(
    mapReliabilityStatus({
      grade: 'B',
      sampleCount: 13,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: '4.2',
    }),
    {
      label: '신뢰도 B · MAPE 4.2%',
      shortLabel: 'B · MAPE 4.2%',
      detail: '최근 13주 MAPE 기본 등급에 최근 4주 오차 추세, 최근 26주 안정성, 데이터 최신성을 반영한 등급입니다.',
      tone: 'ok',
    },
  );
});

test('mapReliabilityStatus assigns warning and critical tones for lower grades', () => {
  assert.equal(
    mapReliabilityStatus({
      grade: 'C',
      sampleCount: 13,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: 7.4,
    }).tone,
    'warning',
  );

  assert.equal(
    mapReliabilityStatus({
      grade: 'E',
      sampleCount: 13,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: 11.2,
    }).tone,
    'critical',
  );
});

test('mapReliabilityStatus renders the top grade with its MAPE', () => {
  assert.deepEqual(
    mapReliabilityStatus({
      grade: 'A+',
      sampleCount: 18,
      minimumSampleCount: 13,
      recent13wWeeklyPriceMape: 0.84,
    }),
    {
      label: '신뢰도 A+ · MAPE 0.8%',
      shortLabel: 'A+ · MAPE 0.8%',
      detail: '최근 13주 MAPE 기본 등급에 최근 4주 오차 추세, 최근 26주 안정성, 데이터 최신성을 반영한 등급입니다.',
      tone: 'ok',
    },
  );
});

test('reliability policy copy explains sample minimum and MAPE-only grading', () => {
  assert.deepEqual(RELIABILITY_POLICY_ITEMS, [
    '공식 신뢰도 등급은 유효한 주간 백테스트 13개가 확보된 후 산정합니다.',
    '현재 분기의 Actual·Forecast 주차 수는 신뢰도 표본 수에 포함하지 않습니다.',
    '등급은 최근 13주 MAPE로 기본 산정한 뒤 최근 4주 오차 추세, 최근 26주 안정성, 데이터 최신성으로 보정합니다.',
    'MAE와 Bias는 품질 참고 지표로 사용하며 공식 등급에는 반영하지 않습니다.',
  ]);
});

test('week-over-week change formats rising, falling, and flat prices', () => {
  const rising = calculateWeekOverWeekChange('1880.14', '1862.46');
  const falling = calculateWeekOverWeekChange('1862.46', '1880.14');
  const flat = calculateWeekOverWeekChange('1862.46', '1862.46');

  assert.deepEqual(rising, {
    direction: 'up',
    amountKrwPerL: 17.68,
    percent: ((1880.14 - 1862.46) / 1862.46) * 100,
  });
  assert.equal(formatWeekOverWeekChange(rising!), '+17.68원 · +0.95% ↑');

  assert.deepEqual(falling, {
    direction: 'down',
    amountKrwPerL: -17.68,
    percent: ((1862.46 - 1880.14) / 1880.14) * 100,
  });
  assert.equal(formatWeekOverWeekChange(falling!), '-17.68원 · -0.94% ↓');

  assert.deepEqual(flat, {
    direction: 'flat',
    amountKrwPerL: 0,
    percent: 0,
  });
  assert.equal(formatWeekOverWeekChange(flat!), '0.00원 · 0.00% →');
});

test('week-over-week change is unavailable without a valid previous price', () => {
  assert.equal(calculateWeekOverWeekChange('1862.46', null), null);
  assert.equal(calculateWeekOverWeekChange('1862.46', '0'), null);
  assert.equal(calculateWeekOverWeekChange('invalid', '1880.14'), null);
});

test('first July week compares against the provided previous-week Opinet price', () => {
  const change = calculateWeekOverWeekChange('1942.39', '2001.30');

  assert.ok(change);
  assert.equal(formatWeekOverWeekChange(change), '-58.91원 · -2.94% ↓');
});
