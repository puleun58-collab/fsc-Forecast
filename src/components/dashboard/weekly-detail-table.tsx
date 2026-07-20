import { Fragment } from 'react';

import {
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

type WeeklyDetailTableProps = {
  weeks: readonly FscDashboardWeekItem[];
};

export function WeeklyDetailTable({ weeks }: WeeklyDetailTableProps) {
  const firstForecastIndex = getFirstForecastIndex(weeks);
  const firstForecastSequenceNo = firstForecastIndex >= 0 ? weeks[firstForecastIndex]?.sequenceNo ?? null : null;
  const { actualWeeks, forecastWeeks } = splitWeekKinds(weeks);

  return (
    <section className="weekly-detail surface-panel" aria-labelledby="weekly-detail-title">
      <div className="panel-header">
        <h2 id="weekly-detail-title">주차별 상세 데이터</h2>
        <p>가격, 기준유가 대비 차이, 산출 방식을 주차 단위로 확인합니다.</p>
      </div>
      <div className="weekly-table-wrap">
        <table className="weekly-table">
          <thead>
            <tr>
              <th scope="col">주차</th>
              <th scope="col">기간</th>
              <th scope="col">상태</th>
              <th scope="col">가격</th>
              <th scope="col">기준유가 대비 차이</th>
              <th scope="col">차이율</th>
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
                <WeekTableRow week={week} />
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="weekly-mobile-list" aria-label="모바일 주차별 상세 데이터">
        <WeekMobileGroup title="실제 구간" weeks={actualWeeks} />
        {forecastWeeks.length > 0 ? <div className="weekly-mobile-list__boundary">예측 시작</div> : null}
        <WeekMobileGroup title="예측 구간" weeks={forecastWeeks} />
      </div>
    </section>
  );
}

function WeekTableRow({ week }: { week: FscDashboardWeekItem }) {
  const sourceText = `${mapForecastSourceKind(week.forecastSourceKind)}${week.fallbackUsed ? ' · 대체값 사용' : ''}`;

  return (
    <tr className={`weekly-table__row weekly-table__row--${week.priceKind}`}>
      <th scope="row">
        <strong>{formatSequenceWeekLabel(week.sequenceNo)}</strong>
        <span>ISO {week.weekNo} · {week.targetMonth}월</span>
      </th>
      <td>{formatWeekRange(week)}</td>
      <td>
        <span className={`kind-label kind-label--${week.priceKind}`}>
          <span aria-hidden="true" />
          {mapWeekKind(week.priceKind)}
        </span>
      </td>
      <td className="numeric-cell">
        <PriceValue value={week.priceKrwPerL} size="compact" />
      </td>
      <td className="numeric-cell">{formatSignedPriceText(week.priceDiffKrwPerL)}</td>
      <td className="numeric-cell">{formatSignedRatioText(week.diffRatio)}</td>
      <td>{sourceText}</td>
    </tr>
  );
}

function WeekMobileGroup({ title, weeks }: { title: string; weeks: readonly FscDashboardWeekItem[] }) {
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
          <PriceValue value={week.priceKrwPerL} size="scenario" />
          <p>
            기준 대비 {formatSignedPriceText(week.priceDiffKrwPerL)} · {formatSignedRatioText(week.diffRatio)}
          </p>
        </div>
      ))}
    </div>
  );
}
