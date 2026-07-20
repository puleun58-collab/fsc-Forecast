import assert from 'node:assert/strict';
import test from 'node:test';

import { mapReliabilityStatus, mapWeekKind, RELIABILITY_POLICY_ITEMS } from './dashboard-format';

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
      detail: '최근 13개 주간 백테스트의 MAPE를 기준으로 산정한 등급입니다.',
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

test('reliability policy copy explains sample minimum and MAPE-only grading', () => {
  assert.deepEqual(RELIABILITY_POLICY_ITEMS, [
    '공식 신뢰도 등급은 유효한 주간 백테스트 13개가 확보된 후 산정합니다.',
    '현재 분기의 실제·예측 주차 수는 신뢰도 표본 수에 포함하지 않습니다.',
    '등급은 최근 13개 백테스트의 MAPE를 기준으로 산정합니다.',
    'MAE와 Bias는 품질 참고 지표로 사용하며 공식 등급에는 반영하지 않습니다.',
  ]);
});

test('mapWeekKind uses public Korean labels', () => {
  assert.equal(mapWeekKind('actual'), '실제');
  assert.equal(mapWeekKind('forecast'), '예측');
});
