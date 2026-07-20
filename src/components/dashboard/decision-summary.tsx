import {
  formatRateLabel,
  formatSignedPriceText,
  formatSignedRatioText,
  formatWeekRange,
  PriceValue,
} from './dashboard-format';

import type { FscDashboardResultSection, FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';

type DecisionSummaryProps = {
  fsc: FscDashboardResultSection;
};

export function DecisionSummary({ fsc }: DecisionSummaryProps) {
  return (
    <section className="decision-summary surface-panel" aria-labelledby="decision-summary-title">
      <ForecastHeadline fsc={fsc} />
      <FscScenarioMatrix fsc={fsc} />
    </section>
  );
}

function ForecastHeadline({ fsc }: DecisionSummaryProps) {
  const latestActualWeek = findLatestActualWeek(fsc.weeks);

  return (
    <div className="decision-summary__primary">
      <p className="section-heading__label">Decision Summary</p>
      <div className="decision-summary__metrics">
        <div className="decision-summary__metric decision-summary__metric--current">
          {latestActualWeek ? (
            <>
              <div className="section-heading">
                <p className="decision-summary__metric-context">실제값 · 집계 완료</p>
                <h2>{latestActualWeek.sequenceNo}주차 평균 경유가</h2>
              </div>
              <PriceValue value={latestActualWeek.priceKrwPerL} size="headline" />
              <p className="decision-summary__week-range">{formatWeekRange(latestActualWeek)}</p>
            </>
          ) : (
            <div className="section-heading">
              <p className="decision-summary__metric-context">실제값 데이터 없음</p>
              <h2>최신 주차 평균 경유가</h2>
            </div>
          )}
        </div>
        <div className="decision-summary__metric decision-summary__metric--quarter">
          <div className="section-heading">
            <p className="decision-summary__metric-context">분기 전체 전망</p>
            <h1 id="decision-summary-title">분기 평균 예상 유가</h1>
          </div>
          <PriceValue value={fsc.quarterAverageKrwPerL} size="headline" />
          <BaselineComparison fsc={fsc} />
        </div>
      </div>
      <div className="decision-summary__baseline-grid" aria-label="기준 가격">
        <div>
          <span className="metric-label">기준유가</span>
          <strong>
            <PriceValue value={fsc.basePriceKrwPerL} size="compact" />
          </strong>
        </div>
        <div>
          <span className="metric-label">현재 적용유가</span>
          <strong>
            <PriceValue value={fsc.appliedPriceKrwPerL} size="compact" />
          </strong>
        </div>
      </div>
      <div className="boundary-key" aria-label={`실제 ${fsc.actualWeekCount}주, 예측 ${fsc.forecastWeekCount}주`}>
        <span className="boundary-key__item">
          <span className="boundary-key__line boundary-key__line--actual" aria-hidden="true" />
          실제 {fsc.actualWeekCount}주
        </span>
        <span className="boundary-key__item">
          <span className="boundary-key__line boundary-key__line--forecast" aria-hidden="true" />
          예측 {fsc.forecastWeekCount}주
        </span>
      </div>
    </div>
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

function BaselineComparison({ fsc }: DecisionSummaryProps) {
  return (
    <p className="baseline-comparison" aria-label="기준유가 대비 차이">
      <strong>{formatSignedPriceText(fsc.priceDiffKrwPerL)}</strong>
      <span>· 기준유가 대비 {formatSignedRatioText(fsc.diffRatio)}</span>
    </p>
  );
}

function FscScenarioMatrix({ fsc }: DecisionSummaryProps) {
  const lowRateLabel = formatRateLabel(fsc.fscLowRate);
  const highRateLabel = formatRateLabel(fsc.fscHighRate);

  return (
    <div className="decision-summary__scenario" aria-labelledby="scenario-title">
      <div className="scenario-panel">
        <div className="scenario-panel__intro">
          <p className="section-heading__label">Derived FSC Result</p>
          <h2 id="scenario-title">분기 예상 유가 기반 FSC 결과</h2>
          <p>분기 평균 예상 유가에 시나리오별 FSC 조정분을 반영한 결과입니다.</p>
        </div>
        <dl className="scenario-matrix">
          <div className="scenario-matrix__row">
            <dt>{lowRateLabel} 적용</dt>
            <dd>
              <PriceValue value={fsc.fscLowKrwPerL} size="scenario" />
            </dd>
          </div>
          <div className="scenario-matrix__row">
            <dt>{highRateLabel} 적용</dt>
            <dd>
              <PriceValue value={fsc.fscHighKrwPerL} size="scenario" />
            </dd>
          </div>
        </dl>
        <p className="scenario-panel__formula">
          {lowRateLabel} 적용값과 {highRateLabel} 적용값은 분기 평균 예상 유가에서 파생됩니다.
        </p>
      </div>
    </div>
  );
}
