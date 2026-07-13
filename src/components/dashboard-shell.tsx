import type { ReactNode } from 'react';

import { PriceTrendChart } from './price-trend-chart';
import { SectionCard } from './section-card';
import type { FscDashboardData, FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

type DashboardShellProps = {
  data: FscDashboardData;
};

type StatusTone = 'success' | 'warning' | 'approved' | 'danger' | 'neutral';
type SummaryCardTone = 'default' | 'brand' | 'success' | 'warning' | 'approved' | 'danger';

const DISPLAY_DECIMALS = 2;

function formatTimestamp(value: string | null): string {
  return value ?? '기록 없음';
}

function formatSignedPrice(value: number | null): string {
  if (value === null) {
    return '직전 비교 불가';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(DISPLAY_DECIMALS)}원/L`;
}

function formatPrice(value: number | null): string {
  return value === null ? '데이터 없음' : `${value.toFixed(DISPLAY_DECIMALS)}원/L`;
}

function formatDecimalString(value: string | null, suffix = ''): string {
  if (value === null) {
    return '기록 없음';
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(DISPLAY_DECIMALS)}${suffix}` : `${value}${suffix}`;
}

function formatPercent(value: number | null): string {
  return value === null ? '비교 불가' : `${value > 0 ? '+' : ''}${value.toFixed(DISPLAY_DECIMALS)}%`;
}

function formatRatioString(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(DISPLAY_DECIMALS)}%` : `${value}%`;
}

function quarterLabel(year: number, quarter: number): string {
  return `${year}년 ${quarter}분기`;
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

function mapTrendDirection(value: 'up' | 'down' | 'flat'): string {
  switch (value) {
    case 'up':
      return '상승';
    case 'down':
      return '하락';
    case 'flat':
    default:
      return '보합';
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
  if (
    label === '현재 적용유가' ||
    label === '분기 평균 예상 유가' ||
    label === '기준유가 대비 차이금액'
  ) {
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

function renderWeekRows(weeks: readonly FscDashboardWeekItem[]): ReactNode {
  return (
    <div className="dashboard-shell__panel">
      <div className="dashboard-shell__summary-chips">
        {weeks.map((week) => (
          <span key={`summary-${week.sequenceNo}`} className="dashboard-shell__summary-chip">
            <strong>{week.sequenceNo}주차</strong>
            <span>{week.priceKind === 'actual' ? '실제' : '예측'}</span>
            <span>{formatDecimalString(week.priceKrwPerL, '원/L')}</span>
          </span>
        ))}
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
              <tr key={week.sequenceNo}>
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
                <td>{formatDecimalString(week.priceKrwPerL, '원/L')}</td>
                <td>{formatDecimalString(week.priceDiffKrwPerL, '원/L')}</td>
                <td>{formatRatioString(week.diffRatio)}</td>
                <td>
                  {mapForecastSourceKind(week.forecastSourceKind)}
                  {week.fallbackUsed ? ' · fallback' : ''}
                </td>
              </tr>
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

  const quarterText = quarterLabel(data.quarter.targetYear, data.quarter.targetQuarter);

  return (
    <main className="dashboard-shell">
      <section className="dashboard-shell__hero">
        <p className="dashboard-shell__eyebrow">FSC calculation MVP</p>
        <h1 className="dashboard-shell__title">FSC Forecast Dashboard</h1>
        <p className="dashboard-shell__description">
          {quarterText} active quarter 기준으로 FSC 기준유가, 분기 평균 예상 유가, 주차별 actual/forecast 반영 결과를 공개합니다.
        </p>
        <div className="dashboard-shell__meta" aria-label="분기 기준 정보">
          <span className="dashboard-shell__meta-item dashboard-shell__meta-item--active">산출 대상 분기: {quarterText}</span>
          <span className="dashboard-shell__meta-item">
            참조 분기: {quarterLabel(data.quarter.referenceYear, data.quarter.referenceQuarter)}
          </span>
          <span className="dashboard-shell__meta-item">분기 시작: {data.quarter.quarterStartDate.slice(0, 10)}</span>
          <span className="dashboard-shell__meta-item">분기 종료: {data.quarter.quarterEndDate.slice(0, 10)}</span>
        </div>
      </section>

      <div className="dashboard-shell__stack">
        <SectionCard
          title="현재 유가 및 FSC 기준"
          badge={
            data.state === 'available'
              ? renderResultStatusBadges(data.fsc.approvalStatus, data.fsc.dataFreshnessStatus)
              : '결과 없음'
          }
          description={`${quarterText} 기준 FSC 산출 결과 요약입니다.`}
          highlights={
            data.state === 'available'
              ? [
                  `산출 기준일 ${data.fsc.createdAt.slice(0, 10)}`,
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
                  ['기준유가', formatDecimalString(data.fsc.basePriceKrwPerL, '원/L')],
                  ['현재 적용유가', formatDecimalString(data.fsc.appliedPriceKrwPerL, '원/L')],
                  ['분기 평균 예상 유가', formatDecimalString(data.fsc.quarterAverageKrwPerL, '원/L')],
                  ['기준유가 대비 차이금액', formatDecimalString(data.fsc.priceDiffKrwPerL, '원/L')],
                  ['기준유가 대비 차이율', formatRatioString(data.fsc.diffRatio)],
                  ['FSC 30%', formatDecimalString(data.fsc.fscLowKrwPerL, '원/L')],
                  ['FSC 70%', formatDecimalString(data.fsc.fscHighKrwPerL, '원/L')],
                  ['데이터 최신성', mapFreshnessStatus(data.fsc.dataFreshnessStatus)],
                  ['승인 상태', mapApprovalStatus(data.fsc.approvalStatus)],
                  ['신뢰도 등급', data.fsc.reliabilityGrade],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={`dashboard-shell__summary-card dashboard-shell__summary-card--${getMetricCardTone(
                      label,
                      data.fsc.approvalStatus,
                      data.fsc.dataFreshnessStatus,
                    )}`}
                  >
                    <span className="dashboard-shell__metric-label">{label}</span>
                    <p className="dashboard-shell__metric-value">{value}</p>
                  </div>
                ))}
              </div>
              <div className="dashboard-shell__support-grid">
                <div className="dashboard-shell__info-block">
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최근 13주 주간 MAPE</span>
                    <strong className="dashboard-shell__info-value">{formatDecimalString(data.fsc.recent13wWeeklyPriceMape, '%')}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최근 26주 주간 MAE</span>
                    <strong className="dashboard-shell__info-value">{formatDecimalString(data.fsc.recent26wWeeklyPriceMae, '원/L')}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최근 4주 오차 추세</span>
                    <strong className="dashboard-shell__info-value">{data.fsc.recent4wErrorTrend ?? '기록 없음'}</strong>
                  </div>
                </div>
                <div className="dashboard-shell__info-block">
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">최신 전국 평균 경유가</span>
                    <strong className="dashboard-shell__info-value">{formatPrice(data.support.currentPrice.latestPriceKrwPerL)}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">직전 대비</span>
                    <strong className="dashboard-shell__info-value">{formatSignedPrice(data.support.currentPrice.absoluteChangeKrwPerL)}</strong>
                  </div>
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">전일 변동률</span>
                    <strong className="dashboard-shell__info-value">{formatPercent(data.support.currentPrice.percentChange)}</strong>
                  </div>
                </div>
                <div className="dashboard-shell__info-block">
                  <div className="dashboard-shell__info-row">
                    <span className="dashboard-shell__metric-label">참조 분기 월별 평균판매가격</span>
                    <strong className="dashboard-shell__info-value">{formatDecimalString(data.fsc.referenceQuarterAverageKrwPerL, '원/L')}</strong>
                  </div>
                  {data.fsc.referenceMonthlyBasis.length > 0 ? (
                    <div className="dashboard-shell__info-list">
                      {data.fsc.referenceMonthlyBasis.map((row) => (
                        <div key={row.monthLabel} className="dashboard-shell__info-row">
                          <span className="dashboard-shell__metric-label">{row.monthLabel}</span>
                          <strong className="dashboard-shell__info-value">{formatDecimalString(row.priceKrwPerL, '원/L')}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="dashboard-shell__metric-label">공식 월간 평균판매가격이 아직 없습니다.</span>
                  )}
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
                  'sourceRecomputeSnapshotId·forecastRunId·revision id는 공개하지 않습니다.',
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
            title="최신 오피넷 유가 참고값"
            badge={data.support.currentPrice.availability === 'available' ? mapTrendDirection(data.support.currentPrice.direction) : '데이터 없음'}
            description="FSC 판단 보조 정보로 최신 전국 평균 자동차용 경유가 상태를 함께 보여줍니다."
            highlights={
              data.support.currentPrice.availability === 'available'
                ? [
                    `기준일 ${data.support.currentPrice.latestPriceDate}`,
                    `커버리지 ${data.support.currentPrice.coverageStartDate ?? '없음'} ~ ${data.support.currentPrice.coverageEndDate ?? '없음'}`,
                    `원천 관측 시각 ${formatTimestamp(data.support.currentPrice.sourceObservedAt)}`,
                  ]
                : []
            }
            emptyStateTitle={data.support.currentPrice.availability === 'unavailable' ? '오피넷 현재 유가를 불러오지 못했습니다.' : undefined}
            emptyStateCopy={data.support.currentPrice.unavailableReason}
          >
            {data.support.currentPrice.availability === 'available' ? (
              <div className="dashboard-shell__panel">
                <div className="dashboard-shell__summary-grid">
                  {[
                    ['최신 전국 평균 경유가', formatPrice(data.support.currentPrice.latestPriceKrwPerL)],
                    ['직전 대비', formatSignedPrice(data.support.currentPrice.absoluteChangeKrwPerL)],
                    ['직전 가격', formatPrice(data.support.currentPrice.previousPriceKrwPerL)],
                    ['전일 변동률', formatPercent(data.support.currentPrice.percentChange)],
                  ].map(([label, value]) => (
                    <div key={label} className="dashboard-shell__summary-card dashboard-shell__summary-card--default">
                      <span className="dashboard-shell__metric-label">{label}</span>
                      <p className="dashboard-shell__metric-value">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : undefined}
          </SectionCard>

          <SectionCard
            title="전국 평균 유가 추이"
            badge="보조 차트"
            description="기존 오피넷 일별 current truth를 기반으로 최근 추이를 보조 정보로 유지합니다."
            highlights={[
              `최신 주간 평균 ${formatPrice(data.support.trend.latestWeeklyAverageKrwPerL)}`,
              `최신 월간 평균 ${formatPrice(data.support.trend.latestMonthlyAverageKrwPerL)}`,
              'FSC 산출 중심 화면으로 전환했지만 추이 차트는 참고용으로 유지합니다.',
            ]}
          >
            <PriceTrendChart points={data.support.trend.points} unavailableReason={data.support.trend.unavailableReason} />
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
