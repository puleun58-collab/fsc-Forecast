import {
  calculateWeekOverWeekChange,
  formatRateLabel,
  formatSignedPriceText,
  formatSignedRatioText,
  formatWeekRange,
  formatWeekOverWeekChange,
  mapWeekKind,
  PriceValue,
} from './dashboard-format';

import type { FscDashboardResultSection, FscDashboardWeekItem } from '@/lib/dashboard/fsc-types';
import { getChangeDirection } from '@/lib/dashboard/display-format';
import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';

type DecisionSummaryProps = {
  fsc: FscDashboardResultSection;
};

type DecisionSummaryInteractiveProps = DecisionSummaryProps & {
  priceInput: string;
  inputError: string | null;
  isPriceModified: boolean;
  onPriceChange: (value: string) => void;
  onPriceReset: () => void;
};

export function DecisionSummary({
  fsc,
  priceInput,
  inputError,
  isPriceModified,
  onPriceChange,
  onPriceReset,
}: DecisionSummaryInteractiveProps) {
  return (
    <section className="decision-summary surface-panel" aria-labelledby="decision-summary-title">
      <ForecastHeadline
        fsc={fsc}
        priceInput={priceInput}
        inputError={inputError}
        isPriceModified={isPriceModified}
        onPriceChange={onPriceChange}
        onPriceReset={onPriceReset}
      />
      <FscScenarioMatrix fsc={fsc} />
    </section>
  );
}

function ForecastHeadline({
  fsc,
  priceInput,
  inputError,
  isPriceModified,
  onPriceChange,
  onPriceReset,
}: DecisionSummaryInteractiveProps) {
  const latestActualWeek = findLatestActualWeek(fsc.weeks);
  const previousActualWeek = latestActualWeek
    ? fsc.weeks.find(
        (week) => week.priceKind === 'actual' && week.sequenceNo === latestActualWeek.sequenceNo - 1,
      ) ?? null
    : null;
  const weekOverWeekChange = latestActualWeek
    ? calculateWeekOverWeekChange(latestActualWeek.priceKrwPerL, previousActualWeek?.priceKrwPerL ?? null)
    : null;
  const displayWeekTitle = latestActualWeek
    ? (() => {
        const { month, weekOfMonth } = getOpinetDisplayWeek(
          latestActualWeek.weekStartDate,
          latestActualWeek.weekEndDate,
        );
        return `${month}월 ${weekOfMonth}주차 평균 유가`;
      })()
    : null;

  return (
    <div className="decision-summary__primary">
      <p className="section-heading__label">Decision Summary</p>
      <div className="decision-summary__metrics">
        <div className="decision-summary__metric decision-summary__metric--current">
          {latestActualWeek ? (
            <>
              <div className="section-heading">
                <p className="decision-summary__metric-context">
                  {mapWeekKind(latestActualWeek.priceKind)}
                </p>
                <h2>{displayWeekTitle}</h2>
              </div>
              <PriceValue value={latestActualWeek.priceKrwPerL} size="headline" />
              {weekOverWeekChange ? (
                <p
                  className={`decision-summary__week-change decision-summary__week-change--${weekOverWeekChange.direction}`}
                  aria-label={`전주 대비 ${formatWeekOverWeekChange(weekOverWeekChange)}`}
                >
                  전주 대비 {formatWeekOverWeekChange(weekOverWeekChange)}
                </p>
              ) : null}
              <p className="decision-summary__week-range">{formatWeekRange(latestActualWeek)}</p>
            </>
          ) : (
            <div className="section-heading">
              <p className="decision-summary__metric-context">Actual 데이터 없음</p>
              <h2>최신 주차 평균 유가</h2>
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
          <div className="decision-summary__price-control">
            <label htmlFor="scenario-price-input">
              <span className="metric-label">기준·적용 유가</span>
              <span className={`price-input${inputError ? ' price-input--error' : ''}`}>
                <input
                  id="scenario-price-input"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={priceInput}
                  aria-describedby="scenario-price-help"
                  aria-invalid={inputError !== null}
                  onChange={(event) => onPriceChange(event.target.value)}
                />
                <span>원/L</span>
              </span>
            </label>
            <button type="button" onClick={onPriceReset} disabled={!isPriceModified && inputError === null}>
              초기화
            </button>
          </div>
        </div>
      </div>
      <div className="decision-summary__footer-row">
        <div className="boundary-key" aria-label={`Actual ${fsc.actualWeekCount}주, Forecast ${fsc.forecastWeekCount}주`}>
          <span className="boundary-key__item">
            <span className="boundary-key__line boundary-key__line--actual" aria-hidden="true" />
            Actual {fsc.actualWeekCount}주
          </span>
          <span className="boundary-key__item">
            <span className="boundary-key__line boundary-key__line--forecast" aria-hidden="true" />
            Forecast {fsc.forecastWeekCount}주
          </span>
        </div>
        <p id="scenario-price-help" className={inputError ? 'price-input__help price-input__help--error' : 'price-input__help'}>
          {inputError ?? (isPriceModified ? '입력한 가격으로 화면의 파생값을 계산했습니다.' : '값을 바꾸면 관련 결과가 즉시 갱신됩니다.')}
        </p>
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
  const direction = getChangeDirection(fsc.priceDiffKrwPerL);

  return (
    <p
      className={`baseline-comparison directional-value directional-value--${direction}`}
      aria-label="기준유가 대비 차이"
    >
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
