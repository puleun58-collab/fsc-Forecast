import { ForecastChart } from './forecast-chart';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

type WeeklyForecastSectionProps = {
  fsc: FscDashboardResultSection;
  historical?: boolean;
};

export function WeeklyForecastSection({ fsc, historical = false }: WeeklyForecastSectionProps) {
  return (
    <section className="weekly-forecast surface-panel" aria-labelledby="weekly-forecast-title">
      <div className="panel-header panel-header--inline">
        <div>
          <h2 id="weekly-forecast-title">{historical ? '주간 유가 실적' : '주간 유가 전망'}</h2>
          <p>
            {historical
              ? '선택한 분기 안의 확정 Actual 주간 유가만 표시합니다.'
              : '완료 주차는 Actual 실선으로, 이후 주차는 Forecast 점선으로 표시합니다.'}
          </p>
        </div>
        <ForecastLegend
          actualWeekCount={fsc.actualWeekCount}
          forecastWeekCount={fsc.forecastWeekCount}
          hideForecast={historical}
        />
      </div>
      <ForecastChart weeks={fsc.weeks} basePriceKrwPerL={fsc.basePriceKrwPerL} />
    </section>
  );
}

type ForecastLegendProps = {
  actualWeekCount: number;
  forecastWeekCount: number;
  hideForecast?: boolean;
};

export function ForecastLegend({
  actualWeekCount,
  forecastWeekCount,
  hideForecast = false,
}: ForecastLegendProps) {
  return (
    <div className="forecast-legend" aria-label="차트 범례">
      <span>
        <span className="forecast-legend__line forecast-legend__line--actual" aria-hidden="true" />
        Actual {actualWeekCount}주
      </span>
      {hideForecast ? null : (
        <span>
          <span className="forecast-legend__line forecast-legend__line--forecast" aria-hidden="true" />
          Forecast {forecastWeekCount}주
        </span>
      )}
      <span>
        <span className="forecast-legend__line forecast-legend__line--reference" aria-hidden="true" />
        기준유가
      </span>
    </div>
  );
}
