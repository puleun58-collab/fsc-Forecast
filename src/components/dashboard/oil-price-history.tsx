'use client';

import { useId, useState } from 'react';

import { formatPriceNumber } from '@/lib/dashboard/display-format';

import type {
  OilPriceHistoryQuarter,
  OilPriceHistorySection,
  OilPriceHistoryYear,
} from '@/lib/dashboard/fsc-types';

type OilPriceHistoryProps = {
  readonly history: OilPriceHistorySection;
};

type CompletedQuarter = OilPriceHistoryQuarter & {
  readonly averagePriceKrwPerL: number;
};

const PERCENT_FORMATTER = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatSignedPrice(value: number): string {
  return `${value > 0 ? '+' : ''}${formatPriceNumber(value)}원/L`;
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${PERCENT_FORMATTER.format(value)}%`;
}

function formatBasisDate(value: string): string {
  return value.replaceAll('-', '.');
}

function isCompletedQuarter(quarter: OilPriceHistoryQuarter): quarter is CompletedQuarter {
  return quarter.averagePriceKrwPerL !== null;
}

function SummaryValues({ year }: { readonly year: OilPriceHistoryYear }) {
  const completedQuarters = year.quarters.filter(isCompletedQuarter);
  const latestIncompleteQuarter = [...year.quarters]
    .reverse()
    .find((quarter) => quarter.averagePriceKrwPerL === null);

  return (
    <div className="oil-price-history__summary-values" aria-label={`${year.year}년 분기별 유가 현황 요약`}>
      {completedQuarters.map((quarter) => (
        <span key={`quarter-${quarter.quarter}`} className="oil-price-history__summary-item">
          <strong>{quarter.quarter}분기</strong> {formatPriceNumber(quarter.averagePriceKrwPerL)}원/L
        </span>
      ))}
      {latestIncompleteQuarter?.months.map((month) => (
        <span key={`month-${month.month}`} className="oil-price-history__summary-item">
          <strong>{month.month}월</strong> {formatPriceNumber(month.averagePriceKrwPerL)}원/L
        </span>
      ))}
    </div>
  );
}

function QuarterColumn({ quarter }: { readonly quarter: OilPriceHistoryQuarter }) {
  return (
    <section className="oil-price-history__quarter" aria-labelledby={`oil-price-history-${quarter.year}-q${quarter.quarter}`}>
      <h3 id={`oil-price-history-${quarter.year}-q${quarter.quarter}`}>
        {quarter.year}년 {quarter.quarter}분기
      </h3>
      <dl className="oil-price-history__month-list">
        {quarter.months.map((month) => (
          <div key={month.month}>
            <dt>{month.month}월 평균</dt>
            <dd>{formatPriceNumber(month.averagePriceKrwPerL)}원/L</dd>
          </div>
        ))}
      </dl>
      {quarter.averagePriceKrwPerL !== null ? (
        <div className="oil-price-history__quarter-average">
          <span>{quarter.quarter}분기 평균</span>
          <strong>{formatPriceNumber(quarter.averagePriceKrwPerL)}원/L</strong>
          {quarter.changeFromPreviousQuarter ? (
            <p>
              직전 분기 대비 {formatSignedPrice(quarter.changeFromPreviousQuarter.amountKrwPerL)} ·{' '}
              {formatSignedPercent(quarter.changeFromPreviousQuarter.percent)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function OilPriceHistory({ history }: OilPriceHistoryProps) {
  const detailId = useId();
  const [selectedYear, setSelectedYear] = useState(history.defaultYear);
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedHistory = history.years.find((year) => year.year === selectedYear);

  return (
    <section className="oil-price-history surface-panel" aria-labelledby={`${detailId}-title`}>
      <div className="oil-price-history__bar">
        <div className="oil-price-history__identity">
          <h2 id={`${detailId}-title`}>분기별 유가 현황</h2>
          <strong>{selectedYear}년</strong>
        </div>
        {selectedHistory ? (
          <SummaryValues year={selectedHistory} />
        ) : (
          <p className="oil-price-history__empty" role="status">표시할 월평균 유가 데이터가 없습니다.</p>
        )}
        <div className="oil-price-history__controls">
          <label>
            <span>연도</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {history.availableYears.map((year) => (
                <option key={year} value={year}>{year}년</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button--secondary oil-price-history__toggle"
            aria-expanded={isExpanded}
            aria-controls={detailId}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? '접기' : '상세보기'}
          </button>
        </div>
      </div>
      {isExpanded && selectedHistory ? (
        <div id={detailId} className="oil-price-history__detail">
          <div className="oil-price-history__detail-meta">
            <p>선택 연도의 마감 완료 월평균을 분기별로 누적 표시합니다.</p>
            <time dateTime={selectedHistory.latestDataBasisDate} title="오피넷 월평균 실제 데이터 기준일">
              데이터 기준일 {formatBasisDate(selectedHistory.latestDataBasisDate)}
            </time>
          </div>
          <div className="oil-price-history__quarter-scroll">
            {selectedHistory.quarters.map((quarter) => (
              <QuarterColumn key={quarter.quarter} quarter={quarter} />
            ))}
          </div>
          <p className="oil-price-history__notice">
            월평균은 실제 데이터가 모두 수집된 월만 표시됩니다. 분기 평균은 오피넷 분기 통계 기준입니다.
          </p>
        </div>
      ) : null}
    </section>
  );
}
