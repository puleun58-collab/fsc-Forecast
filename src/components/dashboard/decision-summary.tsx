import {
  calculateWeekOverWeekChange,
  formatDirectionalPriceChange,
  formatDisplayDate,
  formatDisplayDateTime,
  formatRateLabel,
  formatSignedPriceText,
  formatSignedRatioText,
  formatWeekRange,
  formatWeekOverWeekChange,
  PriceValue,
} from './dashboard-format';

import { calculateBaselineComparison } from '@/lib/dashboard/baseline-comparison';
import type {
  FscDashboardCurrentPriceSection,
  FscDashboardResultSection,
  FscDashboardWeekItem,
} from '@/lib/dashboard/fsc-types';
import { formatPercentText } from '@/lib/dashboard/display-format';
import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';

type DecisionSummaryProps = {
  fsc: FscDashboardResultSection;
  currentPrice: FscDashboardCurrentPriceSection;
};


export function DecisionSummary({ fsc, currentPrice }: DecisionSummaryProps) {
  const latestActualWeek = findLatestActualWeek(fsc.weeks);
  const previousActualWeek = latestActualWeek
    ? fsc.weeks.find(
        (week) => week.priceKind === 'actual' && week.sequenceNo === latestActualWeek.sequenceNo - 1,
      ) ?? null
    : null;

  return (
    <section className="decision-summary surface-panel" aria-labelledby="decision-summary-title">
      <DailyDieselPriceCard currentPrice={currentPrice} basePriceKrwPerL={fsc.basePriceKrwPerL} />
      <LatestActualPriceCard
        latestActualWeek={latestActualWeek}
        previousActualWeek={previousActualWeek}
        basePriceKrwPerL={fsc.basePriceKrwPerL}
      />
      <QuarterForecastPriceCard fsc={fsc} />
      <EstimatedFscRateCard fsc={fsc} />
    </section>
  );
}

function DailyDieselPriceCard({
  currentPrice,
  basePriceKrwPerL,
}: {
  currentPrice: FscDashboardCurrentPriceSection;
  basePriceKrwPerL: string;
}) {
  const isAvailable =
    currentPrice.availability === 'available' && currentPrice.latestPriceKrwPerL !== null;

  return (
    <article className="summary-card summary-card--current">
      <SummaryCardHeader eyebrow="현재" title="일일 평균 경유가" />
      <p className="summary-card__context">
        {currentPrice.latestPriceDate === null
          ? '기준일 확인 중'
          : `${formatDisplayDate(currentPrice.latestPriceDate)} 기준`}
      </p>
      <PriceValue
        value={isAvailable ? currentPrice.latestPriceKrwPerL : null}
        fallback="가격 확인 중"
        size="headline"
      />
      {isAvailable ? (
        <p className={`summary-card__change directional-value directional-value--${currentPrice.direction}`}>
          전일 대비 {formatDirectionalPriceChange(currentPrice.direction, currentPrice.absoluteChangeKrwPerL)} ·{' '}
          {formatPercentText(currentPrice.percentChange)} {directionIcon(currentPrice.direction)}
        </p>
      ) : (
        <p className="summary-card__change">{currentPrice.unavailableReason ?? '현재 유가를 확인하고 있습니다.'}</p>
      )}
      <div className="summary-card__footer">
        <BaselineRateComparison
          priceKrwPerL={currentPrice.latestPriceKrwPerL}
          basePriceKrwPerL={basePriceKrwPerL}
          includeAmount
        />
        <span className="metric-caption">
          수집 시각 {formatDisplayDateTime(currentPrice.sourceObservedAt)}
        </span>
      </div>
    </article>
  );
}

function LatestActualPriceCard({
  latestActualWeek,
  previousActualWeek,
  basePriceKrwPerL,
}: {
  latestActualWeek: FscDashboardWeekItem | null;
  previousActualWeek: FscDashboardWeekItem | null;
  basePriceKrwPerL: string;
}) {
  const weekOverWeekChange = latestActualWeek
    ? calculateWeekOverWeekChange(
        latestActualWeek.priceKrwPerL,
        previousActualWeek?.priceKrwPerL ?? null,
      )
    : null;
  const title = latestActualWeek
    ? (() => {
        const { month, weekOfMonth } = getOpinetDisplayWeek(
          latestActualWeek.weekStartDate,
          latestActualWeek.weekEndDate,
        );
        return `${month}월 ${weekOfMonth}주차 평균 유가`;
      })()
    : '최신 주차 평균 유가';

  return (
    <article className="summary-card summary-card--actual">
      <SummaryCardHeader eyebrow="최근 주차" title={title} />
      <p className="summary-card__context">
        {latestActualWeek ? formatWeekRange(latestActualWeek) : 'Actual 데이터 확인 중'}
      </p>
      <PriceValue
        value={latestActualWeek?.priceKrwPerL ?? null}
        fallback="가격 확인 중"
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

function QuarterForecastPriceCard({ fsc }: { fsc: FscDashboardResultSection }) {
  return (
    <article className="summary-card summary-card--quarter">
      <div className="summary-card__header">
        <p className="section-heading__label">분기 전망</p>
        <h1 id="decision-summary-title">분기 평균 예상 유가</h1>
      </div>
      <p className="summary-card__context">Actual과 주간 Forecast 기준</p>
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
};

export function EstimatedFscRateCard({ fsc }: EstimatedFscRateCardProps) {
  const oilWeightLabel = formatRateLabel(fsc.fscLowRate);
  const estimatedFscRate = Number(fsc.diffRatio) * Number(fsc.fscLowRate);
  const estimatedFscRateLabel = formatSignedRatioText(estimatedFscRate);

  return (
    <article className="summary-card summary-card--fsc">
      <SummaryCardHeader eyebrow="Estimated FSC Rate" title="다음 분기 예상 FSC율" />
      <p className="summary-card__context">유가 비중 {oilWeightLabel} 적용</p>
      <strong className="scenario-rate__value">{estimatedFscRateLabel}</strong>
      <div className="summary-card__footer">
        <p className="scenario-panel__formula">
          예상 FSC율 = 기준유가 대비 증감률 × 유가 비중 {oilWeightLabel}
        </p>
      </div>
    </article>
  );
}
