import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import {
  formatWeekDisplayName,
  mapForecastSourceKind,
  mapWeekKind,
} from './dashboard/dashboard-format';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';

export type AdminWeekCompositionWeek = {
  sequenceNo: number;
  targetMonth: number;
  weekStartDate: string;
  weekEndDate: string;
  officialWeekLabel: string | null;
  priceKind: 'actual' | 'forecast';
  priceKrwPerL: string | null;
  forecastSourceKind: 'weekly_point' | 'weekly_trend_extension' | null;
  fallbackUsed: boolean;
};

export type AdminForecastBasis = {
  modelId: string;
  trendLookbackWeeks: number;
  dubai: { lagWeeks: number; weight: number } | null;
  usdKrw: { lagWeeks: number; weight: number } | null;
};

type AdminWeekCompositionProps = {
  actualWeekCount: number;
  forecastWeekCount: number;
  quarterAverageKrwPerL: string | null;
  weeks: readonly AdminWeekCompositionWeek[];
  forecastBasis: AdminForecastBasis | null;
};

function formatIndicator(indicator: AdminForecastBasis['dubai']): string {
  return indicator === null
    ? '미사용'
    : `반영 시차 ${indicator.lagWeeks}주 · 비중 ${Number((indicator.weight * 100).toFixed(1))}%`;
}

/** 표준 산출 경로(주간 예측값)를 벗어난 주차만 행에서 따로 알린다. */
function isExceptionalWeek(week: AdminWeekCompositionWeek): boolean {
  return week.priceKind === 'forecast' && (week.fallbackUsed || week.forecastSourceKind !== 'weekly_point');
}

export function AdminWeekComposition({
  actualWeekCount,
  forecastWeekCount,
  quarterAverageKrwPerL,
  weeks,
  forecastBasis,
}: AdminWeekCompositionProps) {
  if (weeks.length === 0) {
    return (
      <SectionCard
        title="주차 구성"
        badge="주차 없음"
        description="현재 분기의 Actual/Forecast 구성을 확인합니다."
        className="admin-week-composition"
        emptyStateTitle="아직 주차 데이터가 없습니다."
        emptyStateCopy="FSC 재계산 후 Actual / Forecast 구성이 표시됩니다."
      />
    );
  }

  const orderedWeeks = [...weeks].sort((left, right) => left.sequenceNo - right.sequenceNo);

  return (
    <SectionCard
      title="주차 구성"
      badge={`${weeks.length}개 주차`}
      description="현재 분기의 Actual/Forecast 구성을 확인합니다."
      className="admin-week-composition"
    >
      <div className="admin-detail-stack">
        <div className="admin-metric-grid">
          {[
            ['Actual', `${actualWeekCount}주`],
            ['Forecast', `${forecastWeekCount}주`],
            ['분기 예상 평균', formatPriceText(quarterAverageKrwPerL)],
          ].map(([label, value]) => (
            <div key={label} className="admin-metric">
              <span className="dashboard-shell__metric-label">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>주차 상세</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <ul className="week-composition-list">
              {orderedWeeks.map((week) => (
                <li
                  key={week.sequenceNo}
                  className={`week-composition-row week-composition-row--${week.priceKind}`}
                >
                  <span className="week-composition-row__week">
                    <strong>{formatWeekDisplayName(week)}</strong>
                    <span>
                      {formatDashboardDate(week.weekStartDate)} ~ {formatDashboardDate(week.weekEndDate)}
                    </span>
                  </span>
                  <span
                    className={`status-tag ${week.priceKind === 'actual' ? 'status-tag--ok' : ''}`.trim()}
                  >
                    {mapWeekKind(week.priceKind)}
                  </span>
                  <strong className="week-composition-row__price">
                    {formatPriceText(week.priceKrwPerL, '산정 중')}
                  </strong>
                  {isExceptionalWeek(week) ? (
                    <span className="week-composition-row__exception">
                      <span className="status-tag status-tag--warning">
                        {week.fallbackUsed ? '대체값 사용' : '다른 산출 방식'}
                      </span>
                      <span>{mapForecastSourceKind(week.forecastSourceKind)}</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </details>

        {forecastBasis === null ? null : (
          <details className="admin-panel admin-disclosure">
            <summary className="admin-disclosure__summary">
              <strong>Forecast 산출 근거</strong>
              <AdminDisclosureToggle />
            </summary>
            <div className="admin-disclosure__body">
              <div className="admin-metric-grid">
                {[
                  ['예측 방식', '주간 실제값 기준 추세 연장'],
                  ['사용 모델', `Model ${forecastBasis.modelId}`],
                  ['추세 기간', `${forecastBasis.trendLookbackWeeks}주`],
                  ['Dubai', formatIndicator(forecastBasis.dubai)],
                  ['USD/KRW', formatIndicator(forecastBasis.usdKrw)],
                ].map(([label, value]) => (
                  <div key={label} className="admin-metric">
                    <span className="dashboard-shell__metric-label">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </SectionCard>
  );
}
