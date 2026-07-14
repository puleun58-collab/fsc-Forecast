import { Fragment, type ReactNode } from 'react';


import { PriceTrendChart } from './price-trend-chart';
import { SectionCard } from './section-card';
import {
  formatDotDate,
  formatDotDateTime,
  formatPercentText,
  formatPriceNumber,
  formatPriceText,
  formatQuarterLabel,
  formatRatioPercentText,
  formatShortMonthLabel,
  getDirectionalChangeDisplay,
} from '@/lib/dashboard/display-format';

import type { FscDashboardData, FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

type DashboardShellProps = {
  data: FscDashboardData;
};

type StatusTone = 'success' | 'warning' | 'approved' | 'danger' | 'neutral';
type SummaryCardTone = 'default' | 'brand' | 'success' | 'warning' | 'approved' | 'danger';
type MetricKind = 'price' | 'ratio' | 'text';

type SummaryMetric = {
  label: string;
  kind: MetricKind;
  value: string | null;
  caption?: string;
};

function findLatestActualWeek(weeks: readonly FscDashboardWeekItem[]): FscDashboardWeekItem | null {
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    const week = weeks[index];
    if (week.priceKind === 'actual') {
      return week;
    }
  }

  return null;
}


function parseOptionalNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getQuarterMonths(quarter: number): number[] {
  if (quarter === 1) return [1, 2, 3];
  if (quarter === 2) return [4, 5, 6];
  if (quarter === 3) return [7, 8, 9];
  return [10, 11, 12];
}

function mapApprovalStatus(value: string): string {
  switch (value) {
    case 'approved':
      return '승인 완료';
    case 'rejected':
      return '반려';
    case 'pending':
    default:
      return '승인 대기';
  }
}

function mapFreshnessStatus(value: string): string {
  switch (value) {
    case 'fresh':
      return '최신';
    case 'delayed':
      return '지연';
    case 'stale':
      return '오래됨';
    case 'unavailable':
    default:
      return '확인 불가';
  }
}

function mapForecastSourceKind(value: FscDashboardWeekItem['forecastSourceKind']): string {
  switch (value) {
    case 'weekly_point':
      return '주간 forecast';
    case 'monthly_point':
      return '월간 forecast';
    case 'carry_forward':
      return '직전 forecast 승계';
    case 'applied_price_fallback':
      return '현재 적용유가 fallback';
    case 'base_price_fallback':
      return '기준유가 fallback';
    case null:
    default:
      return '실제값 반영';
  }
}

function getApprovalTone(value: string): StatusTone {
  switch (value) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'danger';
    case 'pending':
    default:
      return 'warning';
  }
}

function getFreshnessTone(value: string): StatusTone {
  switch (value) {
    case 'fresh':
      return 'success';
    case 'delayed':
      return 'warning';
    case 'stale':
    case 'unavailable':
    default:
      return 'danger';
  }
}

function getStatusBadgeClassName(tone: StatusTone): string {
  return `dashboard-shell__status-badge dashboard-shell__status-badge--${tone}`;
}

function getMetricCardTone(label: string, approvalStatus: string, freshnessStatus: string): SummaryCardTone {
  if (label === '현재 적용유가' || label === '분기 평균 예상 유가' || label === '기준유가 대비 차이금액') {
    return 'brand';
  }

  if (label === '데이터 최신성') {
    const tone = getFreshnessTone(freshnessStatus);
    return tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger';
  }

  if (label === '승인 상태') {
    const tone = getApprovalTone(approvalStatus);
    return tone === 'approved' ? 'approved' : tone === 'warning' ? 'warning' : 'danger';
  }

  return 'default';
}

function renderUnavailable(title: string, copy: string): ReactNode {
  return (
    <div className="section-card__placeholder" aria-label={title}>
      <span className="section-card__placeholder-title">{title}</span>
      <span className="section-card__placeholder-copy">{copy}</span>
    </div>
  );
}

function renderResultStatusBadges(approvalStatus: string, freshnessStatus: string): ReactNode {
  const approvalTone = getApprovalTone(approvalStatus);
  const freshnessTone = getFreshnessTone(freshnessStatus);

  return (
    <div className="dashboard-shell__status-group" aria-label="결과 상태">
      <span className={getStatusBadgeClassName(approvalTone)}>{mapApprovalStatus(approvalStatus)}</span>
      <span className={getStatusBadgeClassName(freshnessTone)}>{`데이터 ${mapFreshnessStatus(freshnessStatus)}`}</span>
    </div>
  );
}

function renderPriceValue(value: number | string | null, fallback = '기록 없음', emphasis = false): ReactNode {
  if (value === null) {
    return <span>{fallback}</span>;
  }

  return (
    <span className={emphasis ? 'dashboard-shell__price-value dashboard-shell__price-value--hero' : 'dashboard-shell__price-value'}>
      <span className="dashboard-shell__price-number">{formatPriceNumber(value)}</span>
      <span className="dashboard-shell__price-unit">원/L</span>
    </span>
  );
}

function renderMetricValue(kind: MetricKind, value: string | null): ReactNode {
  if (kind === 'price') {
    return renderPriceValue(value);
  }

  if (kind === 'ratio') {
    return <span>{formatRatioPercentText(value)}</span>;
  }

  return <span>{value ?? '기록 없음'}</span>;
}

function renderWeekRows(weeks: readonly FscDashboardWeekItem[]): ReactNode {
  const actualWeeks = weeks.filter((week) => week.priceKind === 'actual');
  const forecastWeeks = weeks.filter((week) => week.priceKind === 'forecast');
  const firstForecastSequenceNo = forecastWeeks[0]?.sequenceNo ?? null;

  return (
    <div className="dashboard-shell__panel">
      <div className="dashboard-shell__summary-chip-groups">
        {actualWeeks.length > 0 ? (
          <div className="dashboard-shell__summary-chip-section">
            <span className="section-card__badge-pill">실제 반영 구간</span>
            <div className="dashboard-shell__summary-chips">
              {actualWeeks.map((week) => (
                <span key={`summary-${week.sequenceNo}`} className="dashboard-shell__summary-chip dashboard-shell__summary-chip--actual">
                  <strong>{week.sequenceNo}주차</strong>
                  <span>실제</span>
                  <span>{formatPriceText(week.priceKrwPerL)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {forecastWeeks.length > 0 ? (
          <div className="dashboard-shell__summary-chip-section">
            <span className="section-card__badge-pill">예측 구간</span>
            <div className="dashboard-shell__summary-chips">
              {forecastWeeks.map((week) => (
                <span key={`summary-${week.sequenceNo}`} className="dashboard-shell__summary-chip dashboard-shell__summary-chip--forecast">
                  <strong>{week.sequenceNo}주차</strong>
                  <span>예측</span>
                  <span>{formatPriceText(week.priceKrwPerL)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="dashboard-shell__table-wrap">
        <table className="dashboard-shell__week-table">
          <thead>
            <tr>
              <th>주차</th>
              <th>기간</th>
              <th>값 구분</th>
              <th>주차 가격</th>
              <th>기준가 대비 차이</th>
              <th>기준가 대비 차이율</th>
              <th>출처</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <Fragment key={week.sequenceNo}>
                {firstForecastSequenceNo === week.sequenceNo ? (
                  <tr className="dashboard-shell__week-row-separator">
                    <td colSpan={7}>
                      <span className="dashboard-shell__week-row-separator-label">예측 구간</span>
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={
                    week.priceKind === 'actual'
                      ? 'dashboard-shell__week-row dashboard-shell__week-row--actual'
                      : 'dashboard-shell__week-row dashboard-shell__week-row--forecast'
                  }
                >
                  <td>
                    <strong>{week.sequenceNo}주차</strong>
                    <div className="dashboard-shell__cell-meta">ISO week {week.weekNo} · {week.targetMonth}월</div>
                  </td>
                  <td>{week.weekStartDate.slice(0, 10)} ~ {week.weekEndDate.slice(0, 10)}</td>
                  <td>
                    <span
                      className={
                        week.priceKind === 'actual'
                          ? 'dashboard-shell__kind-badge dashboard-shell__kind-badge--actual'
                          : 'dashboard-shell__kind-badge dashboard-shell__kind-badge--forecast'
                      }
                    >
                      {week.priceKind === 'actual' ? '실제값' : '예측값'}
                    </span>
                  </td>
                  <td>{formatPriceText(week.priceKrwPerL)}</td>
                  <td>{formatPriceText(week.priceDiffKrwPerL)}</td>
                  <td>{formatRatioPercentText(week.diffRatio)}</td>
                  <td>
                    {mapForecastSourceKind(week.forecastSourceKind)}
                    {week.fallbackUsed ? ' · fallback' : ''}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DashboardShell({ data }: DashboardShellProps) {
  if (data.state === 'unavailable') {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-shell__hero">
          <p className="dashboard-shell__eyebrow">FSC calculation MVP</p>
          <h1 className="dashboard-shell__title">FSC Forecast Dashboard</h1>
          <p className="dashboard-shell__description">
            active quarter 기반 FSC 기준 시나리오를 불러오지 못해 현재는 대시보드를 비가용 상태로 표시합니다.
          </p>
        </section>
        {renderUnavailable(data.reason, data.detail)}
      </main>
    );
  }

  const quarterText = formatQuarterLabel(data.quarter.targetYear, data.quarter.targetQuarter);
  const referenceQuarterText = formatQuarterLabel(data.quarter.referenceYear, data.quarter.referenceQuarter);
  const referenceQuarterMonths = getQuarterMonths(data.quarter.referenceQuarter);
  const referenceQuarterAverage = data.state === 'available' ? parseOptionalNumber(data.fsc.referenceQuarterAverageKrwPerL) : null;
  const latestActualWeek = data.state === 'available' ? findLatestActualWeek(data.fsc.weeks) : null;
const actualWeekMetric: SummaryMetric = latestActualWeek
  ? {
      label: `${latestActualWeek.sequenceNo}주차 실제 반영 가격`,
      kind: 'price',
      value: latestActualWeek.priceKrwPerL,
    }
  : {
      label: '실제 반영 주차 가격',
      kind: 'text',
      value: '기록 없음',
    };



  return (
    <main className="dashboard-shell">
      <section className="dashboard-shell__hero">
        <p className="dashboard-shell__eyebrow">FSC calculation MVP</p>
        <h1 className="dashboard-shell__title">FSC Forecast Dashboard</h1>
        <p className="dashboard-shell__description">
          {quarterText} active quarter 기준으로 FSC 기준유가, 분기 평균 예상 유가, 주차별 actual/forecast{' '}
          <span className="dashboard-shell__keep-together">반영 결과를 공개합니다.</span>
        </p>
        <div className="dashboard-shell__meta" aria-label="분기 기준 정보">
          <span className="dashboard-shell__meta-item dashboard-shell__meta-item--active">산출 대상 분기: {quarterText}</span>
          <span className="dashboard-shell__meta-item">참조 분기: {referenceQuarterText}</span>
          <span className="dashboard-shell__meta-item">분기 시작: {data.quarter.quarterStartDate.slice(0, 10)}</span>
          <span className="dashboard-shell__meta-item">분기 종료: {data.quarter.quarterEndDate.slice(0, 10)}</span>
        </div>
      </section>

      <div className="dashboard-shell__stack">
        <SectionCard
          title="현재 유가 및 FSC 기준"
          badge={data.state === 'available' ? renderResultStatusBadges(data.fsc.approvalStatus, data.fsc.dataFreshnessStatus) : '결과 없음'}
          description={`${quarterText} 기준 FSC 산출 결과 요약입니다.`}
          highlights={
            data.state === 'available'
              ? [
                  `산출 기준일 ${formatDotDate(data.fsc.createdAt.slice(0, 10))}`,
                  `실제 반영 주차 ${data.fsc.actualWeekCount}주`,
                  `예측 잔여 주차 ${data.fsc.forecastWeekCount}주`,
                ]
              : [quarterText, '아직 FSC 산출 결과가 없습니다.', '관리자 재계산 후 결과가 표시됩니다.']
          }
          highlight
          emptyStateTitle={data.state === 'empty' ? '아직 FSC 산출 결과가 없습니다.' : undefined}
          emptyStateCopy={data.state === 'empty' ? '관리자 재계산 후 결과가 표시됩니다.' : undefined}
        >
          {data.state === 'available' ? (
            <div className="dashboard-shell__panel">
              <div className="dashboard-shell__summary-grid">
                {[
                  { label: '기준유가', kind: 'price' as const, value: data.fsc.basePriceKrwPerL },
                  actualWeekMetric,
                  { label: '현재 적용유가', kind: 'price' as const, value: data.fsc.appliedPriceKrwPerL },
                  { label: '분기 평균 예상 유가', kind: 'price' as const, value: data.fsc.quarterAverageKrwPerL },
                  { label: '기준유가 대비 차이금액', kind: 'price' as const, value: data.fsc.priceDiffKrwPerL },
                  { label: '기준유가 대비 차이율', kind: 'ratio' as const, value: data.fsc.diffRatio },
                  { label: 'FSC 30%', kind: 'price' as const, value: data.fsc.fscLowKrwPerL },
                  { label: 'FSC 70%', kind: 'price' as const, value: data.fsc.fscHighKrwPerL },
                  { label: '데이터 최신성', kind: 'text' as const, value: mapFreshnessStatus(data.fsc.dataFreshnessStatus) },
                  { label: '승인 상태', kind: 'text' as const, value: mapApprovalStatus(data.fsc.approvalStatus) },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className={`dashboard-shell__summary-card dashboard-shell__summary-card--${getMetricCardTone(
                      metric.label,
                      data.fsc.approvalStatus,
                      data.fsc.dataFreshnessStatus,
                    )}`}
                  >
                    <span className="dashboard-shell__metric-label">{metric.label}</span>
                    <p className="dashboard-shell__metric-value">{renderMetricValue(metric.kind, metric.value)}</p>
                    {metric.caption ? <span className="dashboard-shell__metric-caption dashboard-shell__summary-card-caption">{metric.caption}</span> : null}
                  </div>
                ))}
              </div>
              <div className="dashboard-shell__support-grid">
                <div className="dashboard-shell__info-block">
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">신뢰도 등급</span>
                    <strong className="dashboard-shell__info-value">{data.fsc.reliabilityGrade}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최근 13주 주간 MAPE</span>
                    <strong className="dashboard-shell__info-value">{formatPercentText(data.fsc.recent13wWeeklyPriceMape)}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최근 26주 주간 MAE</span>
                    <strong className="dashboard-shell__info-value">{formatPriceText(data.fsc.recent26wWeeklyPriceMae)}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최근 4주 오차 추세</span>
                    <strong className="dashboard-shell__info-value">{data.fsc.recent4wErrorTrend ?? '기록 없음'}</strong>
                  </div>
                  <div className="dashboard-shell__info-divider" aria-hidden="true" />
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최신 시세 안내</span>
                    <strong className="dashboard-shell__info-value">아래 최신 가격 카드에서 확인</strong>
                  </div>
                  <span className="dashboard-shell__metric-caption">전일 변동과 갱신 시각은 최신 전국 평균 경유가 카드에 분리해 표시합니다.</span>
                </div>

                <div className="dashboard-shell__reference-card">
                  <div className="dashboard-shell__reference-header">
                    <h3 className="dashboard-shell__subheading">참조 분기 유가</h3>
                    <p className="dashboard-shell__metric-caption">{referenceQuarterText} · FSC 기준 참조값</p>
                  </div>
                  <div className="dashboard-shell__reference-highlight">
                    <span className="dashboard-shell__metric-label">{`${data.quarter.referenceQuarter}분기 평균 판매가격`}</span>
                    <p className="dashboard-shell__reference-price">{renderPriceValue(data.fsc.referenceQuarterAverageKrwPerL)}</p>
                    <span className="dashboard-shell__metric-caption">{`${referenceQuarterMonths[0]}월~${referenceQuarterMonths[2]}월 기준`}</span>
                  </div>
                  <div className="dashboard-shell__reference-divider" aria-hidden="true" />
                  <div className="dashboard-shell__reference-monthly">
                    <span className="dashboard-shell__metric-label">월별 평균</span>
                    {data.fsc.referenceMonthlyBasis.length > 0 ? (
                      <div className="dashboard-shell__info-list">
                        {data.fsc.referenceMonthlyBasis.map((row) => (
                          <div key={row.monthLabel} className="dashboard-shell__monthly-row">
                            <span className="dashboard-shell__metric-label">{formatShortMonthLabel(row.monthLabel)}</span>
                            <strong className="dashboard-shell__info-value">{renderPriceValue(row.priceKrwPerL)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="dashboard-shell__metric-caption">공식 월간 평균판매가격이 아직 없습니다.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : undefined}
        </SectionCard>

        <SectionCard
          title="Active Quarter 주차 반영 내역"
          badge={data.state === 'available' ? `${data.fsc.weeks.length}개 주차` : '결과 없음'}
          description="선택된 active quarter 최신 base 결과의 주차별 actual/forecast 반영 내역만 표시합니다."
          highlights={
            data.state === 'available'
              ? [
                  `실제값 ${data.fsc.actualWeekCount}주 · 예측값 ${data.fsc.forecastWeekCount}주`,
                  '실제값이 존재하는 완료 주차는 forecast로 덮어쓰지 않습니다.',
                ]
              : ['아직 FSC 산출 결과가 없습니다.', '관리자 재계산 후 주차 반영 내역이 표시됩니다.']
          }
          emptyStateTitle={data.state === 'empty' ? '아직 FSC 산출 결과가 없습니다.' : undefined}
          emptyStateCopy={data.state === 'empty' ? '관리자 재계산 후 주차 반영 내역이 표시됩니다.' : undefined}
        >
          {data.state === 'available' ? renderWeekRows(data.fsc.weeks) : undefined}
        </SectionCard>

        <div className="dashboard-shell__support-grid">
          <SectionCard
            title="최신 전국 평균 경유가"
            badge="오피넷"
            description="현재 오피넷 기준 전국 평균 자동차용 경유가와 전일 변동을 함께 보여줍니다."
            emptyStateTitle={data.support.currentPrice.availability === 'unavailable' ? '오피넷 현재 유가를 불러오지 못했습니다.' : undefined}
            emptyStateCopy={data.support.currentPrice.unavailableReason}
          >
            {data.support.currentPrice.availability === 'available' ? (
              <div className="dashboard-shell__latest-card">
                <div className="dashboard-shell__latest-meta">
                  <span className="dashboard-shell__metric-label">{`${formatDotDate(data.support.currentPrice.latestPriceDate) ?? '기준일 없음'} 기준`}</span>
                  <span className="dashboard-shell__metric-caption">
                    {data.support.currentPrice.sourceObservedAt
                      ? `${formatDotDateTime(data.support.currentPrice.sourceObservedAt)} 갱신`
                      : '갱신 시각 없음'}
                  </span>
                </div>
                <p className="dashboard-shell__latest-price">{renderPriceValue(data.support.currentPrice.latestPriceKrwPerL, '데이터 없음', true)}</p>
                {(() => {
                  const change = getDirectionalChangeDisplay(
                    data.support.currentPrice.direction,
                    data.support.currentPrice.absoluteChangeKrwPerL,
                    data.support.currentPrice.percentChange,
                  );
                  return (
                    <p
                      className={`dashboard-shell__change-line dashboard-shell__change-line--${data.support.currentPrice.direction}`}
                      aria-label={`전일 대비 ${change.label} ${change.amountText}, 변동률 ${change.percentText}`}
                    >
                      <span className="dashboard-shell__metric-label">전일 대비</span>
                      <span className="dashboard-shell__change-parts">
                        <span className="dashboard-shell__change-icon" aria-hidden="true">{change.icon}</span>
                        <span>{change.label}</span>
                        <strong>{change.amountText}</strong>
                        <span aria-hidden="true">·</span>
                        <span>{change.percentText}</span>
                      </span>
                    </p>
                  );
                })()}
                <div className="dashboard-shell__latest-footer">
                  <span className="dashboard-shell__metric-caption">직전 가격 {formatPriceText(data.support.currentPrice.previousPriceKrwPerL, '기록 없음')}</span>
                  <span className="dashboard-shell__metric-caption">출처: 오피넷</span>
                </div>
              </div>
            ) : undefined}
          </SectionCard>

          <SectionCard
            title="전국 평균 경유가 추이"
            badge="일별 가격"
            description="최근 오피넷 일별 가격 흐름을 참고 지표로 보여줍니다."
          >
            <PriceTrendChart
              points={data.support.trend.points}
              latestMonthlyAverageKrwPerL={data.support.trend.latestMonthlyAverageKrwPerL}
              referenceQuarterAverageKrwPerL={referenceQuarterAverage}
              referenceQuarterLabel={referenceQuarterText}
              unavailableReason={data.support.trend.unavailableReason}
            />
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
