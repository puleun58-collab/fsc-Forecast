import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOilPriceHistory } from './oil-price-history';

import type {
  NormalizedDieselMonthlyPriceRow,
  NormalizedDieselQuarterlyPriceRow,
} from '@/lib/opinet/types';

function createMonth(year: number, month: number, price: number): NormalizedDieselMonthlyPriceRow {
  const monthText = String(month).padStart(2, '0');
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    monthKey: `${year}${monthText}`,
    monthLabel: `${year}년 ${month}월`,
    monthStartDate: `${year}-${monthText}-01`,
    monthEndDate: `${year}-${monthText}-${String(endDay).padStart(2, '0')}`,
    productCode: 'D047',
    productName: '자동차용경유',
    price,
    source: 'opinet-monthly-average-price',
    fetchedAt: '2026-07-08T00:00:00.000Z',
  };
}

function createQuarter(year: number, quarter: number, price: number): NormalizedDieselQuarterlyPriceRow {
  const startMonth = String((quarter - 1) * 3 + 1).padStart(2, '0');
  const endMonth = String(quarter * 3).padStart(2, '0');
  const endDay = new Date(Date.UTC(year, quarter * 3, 0)).getUTCDate();

  return {
    quarterKey: `${year}Q${quarter}`,
    quarterLabel: `${year}년${quarter}분기`,
    quarterStartDate: `${year}-${startMonth}-01`,
    quarterEndDate: `${year}-${endMonth}-${String(endDay).padStart(2, '0')}`,
    productCode: 'D047',
    productName: '자동차용경유',
    price,
    source: 'opinet-quarterly-average-price',
    fetchedAt: '2026-07-21T00:00:00.000Z',
  };
}

test('분기 평균은 월 데이터가 모두 준비된 경우 오피넷 분기 평균을 사용한다', () => {
  // Given
  const rows = [
    createMonth(2026, 1, 1_400.111),
    createMonth(2026, 2, 1_500.222),
    createMonth(2026, 3, 1_600.333),
    createMonth(2026, 4, 1_700.444),
  ];

  // When
  const history = buildOilPriceHistory(
    rows,
    new Date('2026-07-21T00:00:00.000Z'),
    [createQuarter(2026, 1, 1_674.77)],
  );

  // Then
  assert.deepEqual(history.years[0]?.quarters.map((quarter) => quarter.averagePriceKrwPerL), [
    1_674.77,
    null,
  ]);
});

test('예측 또는 대체 출처와 아직 마감되지 않은 월은 이력에서 제외한다', () => {
  // Given
  const forecastRow = { ...createMonth(2026, 5, 1_800), source: 'forecast' };
  const openMonth = createMonth(2026, 7, 1_900);

  // When
  const history = buildOilPriceHistory(
    [createMonth(2026, 6, 1_850), forecastRow, openMonth],
    new Date('2026-07-21T00:00:00.000Z'),
  );

  // Then
  assert.deepEqual(history.years[0]?.quarters.flatMap((quarter) => quarter.months.map((month) => month.month)), [6]);
});

test('직전 분기 평균이 있을 때만 증감액과 증감률을 원본 정밀값으로 계산한다', () => {
  // Given
  const rows = [
    createMonth(2025, 1, 100),
    createMonth(2025, 2, 200),
    createMonth(2025, 3, 300),
    createMonth(2025, 4, 210),
    createMonth(2025, 5, 220),
    createMonth(2025, 6, 230),
  ];

  // When
  const history = buildOilPriceHistory(
    rows,
    new Date('2026-07-21T00:00:00.000Z'),
    [createQuarter(2025, 1, 200), createQuarter(2025, 2, 220)],
  );

  // Then
  assert.deepEqual(history.years[0]?.quarters.map((quarter) => quarter.changeFromPreviousQuarter), [
    null,
    { amountKrwPerL: 20, percent: 10 },
  ]);
});

test('현재 연도에 데이터가 없어도 연도 선택을 위해 현재 연도를 유지한다', () => {
  // Given
  const rows = [createMonth(2025, 12, 1_650)];

  // When
  const history = buildOilPriceHistory(rows, new Date('2026-07-21T00:00:00.000Z'));

  // Then
  assert.deepEqual(history.availableYears, [2026, 2025]);
  assert.equal(history.defaultYear, 2026);
});

test('기본 연도는 대시보드 기준 시간대인 Asia Seoul의 현재 연도를 사용한다', () => {
  // Given
  const nowAtSeoulNewYear = new Date('2026-12-31T15:00:00.000Z');

  // When
  const history = buildOilPriceHistory([], nowAtSeoulNewYear);

  // Then
  assert.equal(history.defaultYear, 2027);
  assert.deepEqual(history.availableYears, [2027]);
});
