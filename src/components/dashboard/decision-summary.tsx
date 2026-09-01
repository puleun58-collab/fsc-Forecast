import {
  calculateWeekOverWeekChange,
  formatDirectionalPriceChange,
  formatDisplayDate,
  formatDisplayDateTime,
  formatRateLabel,
  formatSignedPriceText,
  formatSignedRatioText,
  formatWeekDisplayName,
  formatWeekRange,
  formatWeekOverWeekChange,
  PriceValue,
} from './dashboard-format';

import { calculateBaselineComparison } from '@/lib/dashboard/baseline-comparison';
import type {
  FscDashboardCurrentPriceSection,
  FscDashboardQuarterSummary,
  FscDashboardResultSection,
  FscDashboardWeekItem,
} from '@/lib/dashboard/fsc-types';
import { formatPercentText } from '@/lib/dashboard/display-format';
import { calculateEstimatedFscRate } from '@/lib/fsc/estimated-fsc-rate';

type DecisionSummaryProps = {
  fsc: FscDashboardResultSection;
  currentPrice: FscDashboardCurrentPriceSection;
  quarter: FscDashboardQuarterSummary;
  isActiveQuarterSelected: boolean;
};


export function DecisionSummary({
  fsc,
  currentPrice,
  quarter,
  isActiveQuarterSelected,
}: DecisionSummaryProps) {
  const actualWeeks = fsc.weeks.filter((week) => week.priceKind === 'actual');
  const latestActualWeek = findLatestActualWeek(actualWeeks);
  const previousActualWeek = latestActualWeek
    ? actualWeeks.find((week) => week.sequenceNo === latestActualWeek.sequenceNo - 1) ?? null
    : null;

  return (
    <section className="decision-summary surface-panel" aria-labelledby="decision-summary-title">
      <DailyDieselPriceCard
        currentPrice={currentPrice}
        basePriceKrwPerL={fsc.basePriceKrwPerL}
        historical={!isActiveQuarterSelected}
      />
      <LatestActualPriceCard
        latestActualWeek={latestActualWeek}
        previousActualWeek={previousActualWeek}
        basePriceKrwPerL={fsc.basePriceKrwPerL}
        historical={!isActiveQuarterSelected}
      />
      <QuarterForecastPriceCard fsc={fsc} quarter={quarter} historical={!isActiveQuarterSelected} />
      <EstimatedFscRateCard fsc={fsc} quarter={quarter} historical={!isActiveQuarterSelected} />
    </section>
  );
}

function DailyDieselPriceCard({
  currentPrice,
  basePriceKrwPerL,
  historical,
}: {
  currentPrice: FscDashboardCurrentPriceSection;
  basePriceKrwPerL: string;
  historical: boolean;
}) {
  const isAvailable =
    currentPrice.availability === 'available' && currentPrice.latestPriceKrwPerL !== null;

  return (
    <article className="summary-card summary-card--current">
      <SummaryCardHeader eyebrow="현재" title="전국 평균 경유가" />
      <p className="summary-card__context">
        {currentPrice.latestPriceDate === null
          ? historical
            ? '선택 분기 내 일별 Actual 없음'
            : '기준일 확인 중'
          : `${formatDisplayDate(currentPrice.latestPriceDate)} 기준`}
      </p>
      <PriceValue
        value={isAvailable ? currentPrice.latestPriceKrwPerL : null}
        fallback={historical ? '데이터 없음' : '가격 확인 중'}
        size="headline"
      />
      {isAvailable ? (
        <p className={`summary-card__change directional-value directional-value--${currentPrice.direction}`}>
          전일 대비 {formatDirectionalPriceChange(currentPrice.direction, currentPrice.absoluteChangeKrwPerL)} ·{' '}
          {formatPercentText(currentPrice.percentChange)} {directionIcon(currentPrice.direction)}
        </p>
      ) : (
        <p className="summary-card__change">
          {currentPrice.unavailableReason ?? (historical ? '데이터 없음' : '현재 유가를 확인하고 있습니다.')}
        </p>
      )}
      <div className="summary-card__footer">
        <BaselineRateComparison
          priceKrwPerL={currentPrice.latestPriceKrwPerL}
          basePriceKrwPerL={basePriceKrwPerL}
          includeAmount
        />
      </div>
    </article>
  );
}

function LatestActualPriceCard({
  latestActualWeek,
  previousActualWeek,
  basePriceKrwPerL,
  historical,
}: {
  latestActualWeek: FscDashboardWeekItem | null;
  previousActualWeek: FscDashboardWeekItem | null;
  basePriceKrwPerL: string;
  historical: boolean;
}) {
  const weekOverWeekChange = latestActualWeek
    ? calculateWeekOverWeekChange(
        latestActualWeek.priceKrwPerL,
        previousActualWeek?.priceKrwPerL ?? null,
      )
    : null;
  const title = latestActualWeek
    ? `${formatWeekDisplayName(latestActualWeek)} 평균 유가`
    : '최신 주차 평균 유가';

  return (
    <article className="summary-card summary-card--actual">
      <SummaryCardHeader eyebrow="최근 주차" title={title} />
      <p className="summary-card__context">
        {latestActualWeek
          ? `${formatDisplayDate(latestActualWeek.weekStartDate)}–${formatDisplayDate(latestActualWeek.weekEndDate)}`
          : 'Actual 데이터 없음'}
      </p>
      <PriceValue
        value={latestActualWeek?.priceKrwPerL ?? null}
        fallback={historical ? '데이터 없음' : '가격 확인 중'}
        size="headline"
      />
      <p
        className={`summary-card__change${
          weekOverWeekChange ? ` directional-value directional-value--${weekOverWeekChange.direction}` : ''
        }`}
      >
        {weekOverWeekChange
          ? `전주 대비 ${formatWeekOverWeekChange(weekOverWeekChange)}`
          : '전주 비교 기준 없음'}
      </p>
      <div className="summary-card__footer">
        <BaselineRateComparison
          priceKrwPerL={latestActualWeek?.priceKrwPerL ?? null}
          basePriceKrwPerL={basePriceKrwPerL}
          includeAmount
        />
      </div>
    </article>
  );
}

function QuarterForecastPriceCard({
  fsc,
  quarter,
  historical,
}: {
  fsc: FscDashboardResultSection;
  quarter: FscDashboardQuarterSummary;
  historical: boolean;
}) {
  return (
    <article className="summary-card summary-card--quarter">
      <div className="summary-card__header">
        <p className="section-heading__label">{historical ? '분기 실적' : '분기 전망'}</p>
        <h1 id="decision-summary-title">
          {historical ? `${quarter.targetQuarter}분기 평균 유가` : '분기 평균 예상 유가'}
        </h1>
      </div>
      <p className="summary-card__context">
        {historical
          ? fsc.quarterAverageBasisKind === 'official_monthly_average'
            ? '오피넷 공식 월 평균 기준'
            : '오피넷 공식 분기 평균'
          : 'Actual과 주간 Forecast 기준'}
      </p>
      <PriceValue value={fsc.quarterAverageKrwPerL} size="headline" />
      <div className="summary-card__footer">
        <BaselineRateComparison
          priceKrwPerL={fsc.quarterAverageKrwPerL}
          basePriceKrwPerL={fsc.basePriceKrwPerL}
          includeAmount
        />
      </div>
    </article>
  );
}

function SummaryCardHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="summary-card__header">
      <p className="section-heading__label">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function BaselineRateComparison({
  priceKrwPerL,
  basePriceKrwPerL,
  includeAmount = false,
}: {
  priceKrwPerL: number | string | null;
  basePriceKrwPerL: number | string | null;
  includeAmount?: boolean;
}) {
  const comparison = calculateBaselineComparison(priceKrwPerL, basePriceKrwPerL);

  if (comparison === null) {
    return <p className="summary-card__baseline">기준유가 대비 산정 중</p>;
  }

  return (
    <p
      className={`summary-card__baseline directional-value directional-value--${comparison.direction}`}
    >
      기준유가 대비{' '}
      {includeAmount ? `${formatSignedPriceText(comparison.amountKrwPerL)} · ` : ''}
      {formatSignedRatioText(comparison.ratio)} {directionIcon(comparison.direction)}
    </p>
  );
}

function findLatestActualWeek(weeks: readonly FscDashboardWeekItem[]): FscDashboardWeekItem | null {
  return weeks.reduce<FscDashboardWeekItem | null>((latest, week) => {
    if (week.priceKind !== 'actual') {
      return latest;
    }

    return latest === null || week.sequenceNo > latest.sequenceNo ? week : latest;
  }, null);
}

function directionIcon(direction: 'up' | 'down' | 'flat'): '↑' | '↓' | '→' {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}

type EstimatedFscRateCardProps = {
  fsc: Pick<FscDashboardResultSection, 'diffRatio' | 'fscLowRate'>;
  quarter?: Pick<FscDashboardQuarterSummary, 'targetQuarter'>;
  historical?: boolean;
};

export function EstimatedFscRateCard({
  fsc,
  quarter,
  historical = false,
}: EstimatedFscRateCardProps) {
  const oilWeightLabel = formatRateLabel(fsc.fscLowRate);
  const estimatedFscRateLabel = formatSignedRatioText(
    calculateEstimatedFscRate({ diffRatio: fsc.diffRatio, oilWeightRate: fsc.fscLowRate }),
  );
  const nextQuarter = quarter ? (quarter.targetQuarter === 4 ? 1 : quarter.targetQuarter + 1) : null;

  return (
    <article className="summary-card summary-card--fsc">
      <SummaryCardHeader
        eyebrow={historical ? 'FSC Result' : 'Estimated FSC Rate'}
        title={
          historical && nextQuarter
            ? `${nextQuarter}분기 산출 FSC율`
            : '다음 분기 예상 FSC율'
        }
      />
      <p className="summary-card__context">유가 비중 {oilWeightLabel} 적용</p>
      <strong className="scenario-rate__value">{estimatedFscRateLabel}</strong>
      <div className="summary-card__footer">
        <p className="scenario-panel__formula">
          {historical ? '산출 FSC율' : '예상 FSC율'} = 기준유가 대비 증감률 × 유가 비중 {oilWeightLabel}
        </p>
      </div>
    </article>
  );
}
