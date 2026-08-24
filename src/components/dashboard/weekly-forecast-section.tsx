import { ForecastChart } from './forecast-chart';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';
import { formatDotDate, formatPriceNumber, formatPriceText } from '@/lib/dashboard/display-format';

type WeeklyAnalysisView = 'quarter' | 'outlook';

type WeeklyForecastSectionProps = {
  fsc: FscDashboardResultSection;
  view: WeeklyAnalysisView;
  onViewChange: (view: WeeklyAnalysisView) => void;
};

const DIRECTION_LABEL = {
  up: '상승 전망',
  down: '하락 전망',
  flat: '보합 전망',
} as const;

export function WeeklyForecastSection({ fsc, view, onViewChange }: WeeklyForecastSectionProps) {
  const isOutlook = view === 'outlook';
  const outlook = fsc.weeklyOutlook;
  const chartWeeks = isOutlook ? outlook.weeks : fsc.weeks;
  const actualWeekCount = isOutlook ? outlook.actualWeekCount : fsc.actualWeekCount;
  const forecastWeekCount = isOutlook ? outlook.forecastWeekCount : fsc.forecastWeekCount;

  return (
    <section className="weekly-forecast surface-panel" aria-labelledby="weekly-forecast-title">
      <div className="weekly-analysis__header">
        <div className="panel-header">
          <h2 id="weekly-forecast-title">{isOutlook ? '향후 13주 유가 전망' : '주간 유가 추이'}</h2>
          <p>
            {isOutlook
              ? '마감 완료된 최근 Actual 4주와 이후 13주 Forecast를 연속해서 표시합니다.'
              : '현재 분기의 완료 주차는 Actual 선으로, 이후 주차는 Forecast 점선으로 표시합니다.'}
          </p>
        </div>
        <div className="weekly-analysis__toolbar">
          <div className="weekly-analysis__tabs" role="tablist" aria-label="주간 유가 분석 범위">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'quarter'}
              aria-controls="weekly-analysis-chart"
              onClick={() => onViewChange('quarter')}
            >
              현재 분기
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'outlook'}
              aria-controls="weekly-analysis-chart"
              onClick={() => onViewChange('outlook')}
            >
              향후 13주 전망
            </button>
          </div>
          <ForecastLegend
            actualWeekCount={actualWeekCount}
            forecastWeekCount={forecastWeekCount}
            showConfidence={isOutlook && outlook.hasConfidenceBounds}
          />
        </div>
      </div>
      {isOutlook ? <OutlookSummary fsc={fsc} /> : null}
      <div id="weekly-analysis-chart" role="tabpanel">
        <ForecastChart
          weeks={chartWeeks}
          basePriceKrwPerL={fsc.basePriceKrwPerL}
          view={view}
        />
      </div>
    </section>
  );
}

function OutlookSummary({ fsc }: { readonly fsc: FscDashboardResultSection }) {
  const outlook = fsc.weeklyOutlook;
  const rangeText =
    outlook.forecastMinKrwPerL === null || outlook.forecastMaxKrwPerL === null
      ? '산출 대기'
      : `${formatPriceNumber(outlook.forecastMinKrwPerL)}–${formatPriceNumber(outlook.forecastMaxKrwPerL)}원/L`;

  return (
    <div className="weekly-outlook-summary" aria-label="향후 13주 전망 요약">
      <div>
        <span>최신 Actual</span>
        <strong>{formatPriceText(outlook.latestActualPriceKrwPerL)}</strong>
        <small>{formatDotDate(outlook.basisDate) ?? '마감일 확인 중'} 기준</small>
      </div>
      <div>
        <span>{outlook.forecastWeekCount || 13}주 예상 평균</span>
        <strong>{formatPriceText(outlook.forecastAverageKrwPerL, '산출 대기')}</strong>
        <small>주간 Forecast 평균</small>
      </div>
      <div>
        <span>{outlook.hasConfidenceBounds ? '신뢰 범위' : '예측 최저·최고'}</span>
        <strong>{rangeText}</strong>
        <small>{outlook.hasConfidenceBounds ? '하단·상단 신뢰 범위' : '주간 예측값 기준'}</small>
      </div>
      <div>
        <span>전망 방향</span>
        <strong className={`weekly-outlook-summary__direction weekly-outlook-summary__direction--${outlook.direction}`}>
          {DIRECTION_LABEL[outlook.direction]}
        </strong>
        <small>최신 Actual 대비 {outlook.forecastWeekCount || 13}주차</small>
      </div>
      {outlook.forecastWeekCount < 13 ? (
        <p role="status">현재 저장된 주간 예측은 {outlook.forecastWeekCount}주입니다. 다음 예측 재계산부터 13주가 반영됩니다.</p>
      ) : null}
    </div>
  );
}

type ForecastLegendProps = {
  actualWeekCount: number;
  forecastWeekCount: number;
  showConfidence?: boolean;
};

export function ForecastLegend({ actualWeekCount, forecastWeekCount, showConfidence = false }: ForecastLegendProps) {
  return (
    <div className="forecast-legend" aria-label="차트 범례">
      <span>
        <span className="forecast-legend__line forecast-legend__line--actual" aria-hidden="true" />
        Actual {actualWeekCount}주
      </span>
      <span>
        <span className="forecast-legend__line forecast-legend__line--forecast" aria-hidden="true" />
        Forecast {forecastWeekCount}주
      </span>
      <span>
        <span className="forecast-legend__line forecast-legend__line--reference" aria-hidden="true" />
        기준유가
      </span>
      {showConfidence ? (
        <span>
          <span className="forecast-legend__band" aria-hidden="true" />
          예측 범위
        </span>
      ) : null}
    </div>
  );
}
