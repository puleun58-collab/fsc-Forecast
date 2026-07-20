import { ForecastChart } from './forecast-chart';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

type WeeklyForecastSectionProps = {
  fsc: FscDashboardResultSection;
};

export function WeeklyForecastSection({ fsc }: WeeklyForecastSectionProps) {
  return (
    <section className="weekly-forecast surface-panel" aria-labelledby="weekly-forecast-title">
      <div className="panel-header panel-header--inline">
        <div>
          <h2 id="weekly-forecast-title">주간 유가 추이</h2>
          <p>실제값이 있는 완료 주차는 actual 선으로, 이후 주차는 forecast 점선으로 표시합니다.</p>
        </div>
        <ForecastLegend actualWeekCount={fsc.actualWeekCount} forecastWeekCount={fsc.forecastWeekCount} />
      </div>
      <ForecastChart weeks={fsc.weeks} basePriceKrwPerL={fsc.basePriceKrwPerL} />
    </section>
  );
}

type ForecastLegendProps = {
  actualWeekCount: number;
  forecastWeekCount: number;
};

export function ForecastLegend({ actualWeekCount, forecastWeekCount }: ForecastLegendProps) {
  return (
    <div className="forecast-legend" aria-label="차트 범례">
      <span>
        <span className="forecast-legend__line forecast-legend__line--actual" aria-hidden="true" />
        실제 {actualWeekCount}주
      </span>
      <span>
        <span className="forecast-legend__line forecast-legend__line--forecast" aria-hidden="true" />
        예측 {forecastWeekCount}주
      </span>
      <span>
        <span className="forecast-legend__line forecast-legend__line--reference" aria-hidden="true" />
        기준유가
      </span>
    </div>
  );
}
