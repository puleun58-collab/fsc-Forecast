'use client';

import { Fragment, useState } from 'react';

import {
  calculateWeekOverWeekChange,
  formatWeekOverWeekChange,
  formatSignedPriceText,
  formatSignedRatioText,
  formatWeekRange,
  mapWeekKind,
  PriceValue,
} from './dashboard-format';

import type {
  FscDashboardOutlookWeekItem,
  FscDashboardWeeklyOutlook,
  WeeklyOutlookConfidence,
} from '@/lib/dashboard/fsc-types';
import { formatPriceText } from '@/lib/dashboard/display-format';
import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';

const CONFIDENCE_LABEL: Record<WeeklyOutlookConfidence, string> = {
  actual: 'Actual',
  short: '단기 전망',
  medium: '중기 전망',
  long: '장기 전망',
};

function formatOpinetWeekLabel(week: FscDashboardOutlookWeekItem): string {
  try {
    const displayWeek = getOpinetDisplayWeek(week.weekStartDate, week.weekEndDate);
    return `${displayWeek.month}월 ${displayWeek.weekOfMonth}주차`;
  } catch {
    return `${week.targetMonth}월`;
  }
}

function formatOutlookWeekTitle(
  week: FscDashboardOutlookWeekItem,
  index: number,
  actualWeekCount: number,
): string {
  if (week.horizonIndex !== null) {
    return `Forecast ${week.horizonIndex}주`;
  }

  const weeksAgo = actualWeekCount - index - 1;
  return weeksAgo === 0 ? '최신 Actual' : `Actual ${weeksAgo}주 전`;
}

function formatConfidenceRange(week: FscDashboardOutlookWeekItem): string {
  if (week.lowerBoundKrwPerL === null || week.upperBoundKrwPerL === null) {
    return week.priceKind === 'actual' ? '해당 없음' : '산출 범위 없음';
  }

  return `${formatPriceText(week.lowerBoundKrwPerL)}–${formatPriceText(week.upperBoundKrwPerL)}`;
}

function formatOutlookWeekChange(
  week: FscDashboardOutlookWeekItem,
  previousPriceKrwPerL: string | null,
): string {
  const change = calculateWeekOverWeekChange(week.priceKrwPerL, previousPriceKrwPerL);
  return change === null ? '비교 기준 없음' : formatWeekOverWeekChange(change);
}

export function WeeklyOutlookTable({ outlook }: { readonly outlook: FscDashboardWeeklyOutlook }) {
  const [showAllMobile, setShowAllMobile] = useState(false);
  const actualWeeks = outlook.weeks.filter((week) => week.priceKind === 'actual');
  const forecastWeeks = outlook.weeks.filter((week) => week.priceKind === 'forecast');
  const tableWeeks = [...actualWeeks.slice(-1), ...forecastWeeks];
  const mobileWeeks = showAllMobile
    ? tableWeeks
    : [...actualWeeks.slice(-1), ...forecastWeeks.slice(0, 4)];
  const firstForecastSequenceNo = forecastWeeks[0]?.sequenceNo ?? null;

  return (
    <section className="weekly-detail surface-panel" aria-labelledby="weekly-outlook-detail-title">
      <div className="panel-header">
        <h2 id="weekly-outlook-detail-title">주차별 전망</h2>
        <p>최신 Actual과 주차별 예측값, 전주·기준유가 대비 차이, 예측 범위를 확인합니다.</p>
      </div>
      <div className="weekly-table-wrap">
        <table className="weekly-table weekly-outlook-table">
          <thead>
            <tr>
              <th scope="col">주차</th>
              <th scope="col">기간</th>
              <th scope="col">구간</th>
              <th scope="col">가격</th>
              <th scope="col">전주 대비</th>
              <th scope="col">기준유가 대비</th>
              <th scope="col">예측 범위</th>
            </tr>
          </thead>
          <tbody>
            {tableWeeks.map((week, index) => (
              <Fragment key={`${week.priceKind}-${week.sequenceNo}`}>
                {week.sequenceNo === firstForecastSequenceNo ? (
                  <tr className="weekly-table__boundary">
                    <td colSpan={7}>예측 시작</td>
                  </tr>
                ) : null}
                <tr className={`weekly-table__row weekly-table__row--${week.priceKind}`}>
                  <th scope="row">
                    <strong>{formatOutlookWeekTitle(week, index, Math.min(1, actualWeeks.length))}</strong>
                    <span>ISO {week.weekNo} · {week.targetMonth}월</span>
                  </th>
                  <td className="weekly-table__period">
                    <strong>{formatOpinetWeekLabel(week)}</strong>
                    <span aria-hidden="true">·</span>
                    <span>{formatWeekRange(week)}</span>
                  </td>
                  <td>
                    <span className={`outlook-confidence outlook-confidence--${week.confidence}`}>
                      {CONFIDENCE_LABEL[week.confidence]}
                    </span>
                  </td>
                  <td className="numeric-cell"><PriceValue value={week.priceKrwPerL} size="compact" /></td>
                  <td className="numeric-cell">
                    {formatOutlookWeekChange(
                      week,
                      week.previousPriceKrwPerL,
                    )}
                  </td>
                  <td className="numeric-cell">
                    {formatSignedPriceText(week.priceDiffKrwPerL)} · {formatSignedRatioText(week.diffRatio)}
                  </td>
                  <td className="numeric-cell weekly-outlook-table__range">{formatConfidenceRange(week)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="weekly-mobile-list" aria-label="모바일 주차별 전망">
        {mobileWeeks.map((week, index) => (
          <div key={`${week.priceKind}-${week.sequenceNo}`} className={`weekly-mobile-item weekly-mobile-item--${week.priceKind}`}>
            <div className="weekly-mobile-item__top">
              <strong>{formatOutlookWeekTitle(week, index, Math.min(1, actualWeeks.length))}</strong>
              <span>{CONFIDENCE_LABEL[week.confidence]}</span>
            </div>
            <span className="weekly-mobile-item__period">{formatOpinetWeekLabel(week)} · {formatWeekRange(week, true)}</span>
            <PriceValue value={week.priceKrwPerL} size="scenario" />
            <p>
              전주 대비 {formatOutlookWeekChange(
                week,
                week.previousPriceKrwPerL,
              )}
            </p>
            <p>
              기준 대비 {formatSignedPriceText(week.priceDiffKrwPerL)} · {formatSignedRatioText(week.diffRatio)}
            </p>
            {week.priceKind === 'forecast' ? <p>예측 범위 {formatConfidenceRange(week)}</p> : null}
          </div>
        ))}
        {tableWeeks.length > mobileWeeks.length ? (
          <button
            type="button"
            className="button button--secondary outlook-mobile-toggle"
            onClick={() => setShowAllMobile(true)}
          >
            13주 전체 보기
          </button>
        ) : null}
        {showAllMobile ? (
          <button
            type="button"
            className="button button--quiet outlook-mobile-toggle"
            onClick={() => setShowAllMobile(false)}
          >
            간단히 보기
          </button>
        ) : null}
      </div>
    </section>
  );
}
