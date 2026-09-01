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

type AdminWeekCompositionProps = {
  actualWeekCount: number;
  forecastWeekCount: number;
  quarterAverageKrwPerL: string | null;
  weeks: readonly AdminWeekCompositionWeek[];
};

export function AdminWeekComposition({
  actualWeekCount,
  forecastWeekCount,
  quarterAverageKrwPerL,
  weeks,
}: AdminWeekCompositionProps) {
  if (weeks.length === 0) {
    return (
      <SectionCard
        title="주차 구성"
        badge="주차 없음"
        description="현재 분기의 실제값과 예측값 구성을 확인합니다."
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
      description="현재 분기의 실제값과 예측값 구성을 확인합니다."
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
            <span className="admin-disclosure__toggle">
              <span className="admin-disclosure__toggle-closed">주차 상세 보기 ▾</span>
              <span className="admin-disclosure__toggle-open">주차 상세 접기 ▴</span>
            </span>
          </summary>
          <div className="admin-disclosure__body">
            <ul className="week-composition-list">
              {orderedWeeks.map((week) => {
                const showSourceDetail = week.priceKind === 'forecast';

                return (
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
                    {week.fallbackUsed ? (
                      <span className="status-tag status-tag--warning">대체값 사용</span>
                    ) : null}
                    {showSourceDetail ? (
                      <details className="week-composition-row__source">
                        <summary>산출 근거 보기</summary>
                        <p>{mapForecastSourceKind(week.forecastSourceKind)}</p>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </details>
      </div>
    </SectionCard>
  );
}
