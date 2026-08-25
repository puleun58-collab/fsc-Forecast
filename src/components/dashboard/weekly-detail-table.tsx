import { Fragment } from 'react';

import {
  calculateWeekOverWeekChange,
  formatWeekOverWeekChange,
  formatSignedPriceText,
  formatSignedRatioText,
  formatSequenceWeekLabel,
  formatWeekRange,
  getFirstForecastIndex,
  mapForecastSourceKind,
  mapWeekKind,
  PriceValue,
  splitWeekKinds,
} from './dashboard-format';

import type { FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';
import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';

type WeeklyDetailTableProps = {
  weeks: readonly FscDashboardWeekItem[];
  previousWeekPriceKrwPerL: string | null;
};

function formatOpinetWeekLabel(week: FscDashboardWeekItem): string {
  try {
    const displayWeek = getOpinetDisplayWeek(week.weekStartDate, week.weekEndDate);
    return `${displayWeek.month}월 ${displayWeek.weekOfMonth}주차`;
  } catch {
    return `${week.targetMonth}월`;
  }
}

export function WeeklyDetailTable({ weeks, previousWeekPriceKrwPerL }: WeeklyDetailTableProps) {
  const firstForecastIndex = getFirstForecastIndex(weeks);
  const firstForecastSequenceNo = firstForecastIndex >= 0 ? weeks[firstForecastIndex]?.sequenceNo ?? null : null;
  const { actualWeeks, forecastWeeks } = splitWeekKinds(weeks);
  const previousWeekBySequenceNo = new Map(
    weeks.map((week, index) => [
      week.sequenceNo,
      index > 0 ? weeks[index - 1]?.priceKrwPerL ?? null : previousWeekPriceKrwPerL,
    ]),
  );

  return (
    <section className="weekly-detail surface-panel" aria-labelledby="weekly-detail-title">
      <div className="panel-header">
        <h2 id="weekly-detail-title">주차별 상세 데이터</h2>
        <p>가격, 전주·기준유가 대비 차이, 산출 방식을 주차 단위로 확인합니다.</p>
      </div>
      <div className="weekly-table-wrap">
        <table className="weekly-table">
          <thead>
            <tr>
              <th scope="col">주차</th>
              <th scope="col">기간</th>
              <th scope="col">상태</th>
              <th scope="col">가격</th>
              <th scope="col">전주 대비</th>
              <th scope="col">기준유가 대비</th>
              <th scope="col">산출 방식</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <Fragment key={week.sequenceNo}>
                {week.sequenceNo === firstForecastSequenceNo ? (
                  <tr className="weekly-table__boundary">
                    <td colSpan={7}>예측 시작</td>
                  </tr>
                ) : null}
                <WeekTableRow
                  week={week}
                  previousPriceKrwPerL={previousWeekBySequenceNo.get(week.sequenceNo) ?? null}
                />
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="weekly-mobile-list" aria-label="모바일 주차별 상세 데이터">
        <WeekMobileGroup
          title="Actual 구간"
          weeks={actualWeeks}
          previousWeekBySequenceNo={previousWeekBySequenceNo}
        />
        {forecastWeeks.length > 0 ? <div className="weekly-mobile-list__boundary">예측 시작</div> : null}
        <WeekMobileGroup
          title="Forecast 구간"
          weeks={forecastWeeks}
          previousWeekBySequenceNo={previousWeekBySequenceNo}
        />
      </div>
    </section>
  );
}

function formatWeekChange(currentWeek: FscDashboardWeekItem, previousPriceKrwPerL: string | null): string {
  const change = calculateWeekOverWeekChange(currentWeek.priceKrwPerL, previousPriceKrwPerL);
  return change === null ? '비교 기준 없음' : formatWeekOverWeekChange(change);
}

function WeekTableRow({
  week,
  previousPriceKrwPerL,
}: {
  week: FscDashboardWeekItem;
  previousPriceKrwPerL: string | null;
}) {
  const sourceText = `${mapForecastSourceKind(week.forecastSourceKind)}${week.fallbackUsed ? ' · 대체값 사용' : ''}`;

  return (
    <tr className={`weekly-table__row weekly-table__row--${week.priceKind}`}>
      <th scope="row">
        <strong>{formatSequenceWeekLabel(week.sequenceNo)}</strong>
        <span>ISO {week.weekNo} · {week.targetMonth}월</span>
      </th>
      <td className="weekly-table__period">
        <strong>{formatOpinetWeekLabel(week)}</strong>
        <span aria-hidden="true">·</span>
        <span>{formatWeekRange(week)}</span>
      </td>
      <td>
        <span className={`kind-label kind-label--${week.priceKind}`}>
          <span aria-hidden="true" />
          {mapWeekKind(week.priceKind)}
        </span>
      </td>
      <td className="numeric-cell">
        <PriceValue value={week.priceKrwPerL} size="compact" />
      </td>
      <td className="numeric-cell">{formatWeekChange(week, previousPriceKrwPerL)}</td>
      <td className="numeric-cell">
        {formatSignedPriceText(week.priceDiffKrwPerL)} · {formatSignedRatioText(week.diffRatio)}
      </td>
      <td>{sourceText}</td>
    </tr>
  );
}

function WeekMobileGroup({
  title,
  weeks,
  previousWeekBySequenceNo,
}: {
  title: string;
  weeks: readonly FscDashboardWeekItem[];
  previousWeekBySequenceNo: ReadonlyMap<number, string | null>;
}) {
  if (weeks.length === 0) {
    return null;
  }

  return (
    <div className="weekly-mobile-list__group">
      <h3>{title}</h3>
      {weeks.map((week) => (
        <div key={week.sequenceNo} className={`weekly-mobile-item weekly-mobile-item--${week.priceKind}`}>
          <div className="weekly-mobile-item__top">
            <strong>
              {formatSequenceWeekLabel(week.sequenceNo)} · {formatWeekRange(week, true)}
            </strong>
            <span>{mapWeekKind(week.priceKind)}</span>
          </div>
          <div className="weekly-mobile-item__metrics">
            <div className="weekly-mobile-item__metric">
              <span>가격</span>
              <PriceValue value={week.priceKrwPerL} size="scenario" />
            </div>
            <div className="weekly-mobile-item__metric">
              <span>전주 대비</span>
              <strong>{formatWeekChange(week, previousWeekBySequenceNo.get(week.sequenceNo) ?? null)}</strong>
            </div>
          </div>
          <p>
            기준 대비 {formatSignedPriceText(week.priceDiffKrwPerL)} · {formatSignedRatioText(week.diffRatio)}
          </p>
        </div>
      ))}
    </div>
  );
}
