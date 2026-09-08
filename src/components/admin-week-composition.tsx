import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import {
  formatSignedPriceText,
  formatSignedRatioText,
  formatWeekDisplayName,
  mapForecastSourceKind,
  mapWeekKind,
} from './dashboard/dashboard-format';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceNumber, formatPriceText } from '@/lib/dashboard/display-format';
import type {
  FirstForecastExplanation,
  ForecastIndicatorCalculation,
} from '@/lib/forecast/forecast-diagnostics';

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
  explanation?: FirstForecastExplanation | null;
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

function formatIndicatorCalculation(indicator: ForecastIndicatorCalculation): string {
  const contribution = `기여 ${formatSignedRatioText(indicator.contributionRatio)}`;
  if (
    indicator.previousWeekEndDate === null ||
    indicator.previousValue === null ||
    indicator.basisWeekEndDate === null ||
    indicator.basisValue === null ||
    indicator.changeRatio === null
  ) {
    return `비교값 없음 · ${contribution}`;
  }

  return `${formatDashboardDate(indicator.previousWeekEndDate)} ${formatPriceNumber(indicator.previousValue)} → ${formatDashboardDate(indicator.basisWeekEndDate)} ${formatPriceNumber(indicator.basisValue)} · 변화 ${formatSignedRatioText(indicator.changeRatio)} · ${contribution}`;
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
  const explanation = forecastBasis?.explanation ?? null;
  const breakdownMetrics =
    explanation === null
      ? []
      : [
          {
            label: '기준 Actual',
            value: formatPriceText(explanation.anchorPriceKrwPerL),
            detail: null,
          },
          {
            label: '기본 추세',
            value: formatSignedPriceText(explanation.trendDeltaKrwPerL, '원/L'),
            detail: null,
          },
          {
            label: '추세 적용 후',
            value: formatPriceText(explanation.baseForecastKrwPerL),
            detail: null,
          },
          {
            label: 'Dubai 보정',
            value:
              explanation.dubai === null
                ? '미사용 · 0.00원/L'
                : `${formatSignedPriceText(explanation.dubai.correctionBeforeCapKrwPerL, '원/L')}${explanation.externalAdjustmentCapReached ? ' (상한 전)' : ''}`,
            detail:
              explanation.dubai === null
                ? null
                : formatIndicatorCalculation(explanation.dubai),
          },
          {
            label: 'USD/KRW 보정',
            value:
              explanation.usdKrw === null
                ? '미사용 · 0.00원/L'
                : `${formatSignedPriceText(explanation.usdKrw.correctionBeforeCapKrwPerL, '원/L')}${explanation.externalAdjustmentCapReached ? ' (상한 전)' : ''}`,
            detail:
              explanation.usdKrw === null
                ? null
                : formatIndicatorCalculation(explanation.usdKrw),
          },
          {
            label: '외부 신호 합산',
            value: formatSignedRatioText(explanation.rawExternalAdjustmentRatio),
            detail: null,
          },
          {
            label: '실제 외부 보정',
            value: `${formatSignedRatioText(explanation.appliedExternalAdjustmentRatio)} · ${formatSignedPriceText(explanation.appliedExternalCorrectionKrwPerL, '원/L')}`,
            detail: null,
          },
          {
            label: '외부 보정 상한',
            value: explanation.externalAdjustmentCapReached
              ? `±${Number((explanation.externalAdjustmentCapRatio * 100).toFixed(2))}% 적용`
              : `미적용 · 설정 ±${Number((explanation.externalAdjustmentCapRatio * 100).toFixed(2))}%`,
            detail: null,
          },
          {
            label: '첫 Forecast',
            value: formatPriceText(explanation.firstForecastKrwPerL),
            detail: null,
          },
        ];

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
              {explanation === null ? null : (
                <>
                  <div className="admin-metric-grid forecast-basis__breakdown">
                    {breakdownMetrics.map((metric) => (
                      <div key={metric.label} className="admin-metric">
                        <span className="dashboard-shell__metric-label">{metric.label}</span>
                        <strong>{metric.value}</strong>
                        {metric.detail === null ? null : (
                          <span className="admin-decision__note">{metric.detail}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="admin-decision__note">
                    예측 시작 구간 변동 ·{' '}
                    {formatSignedPriceText(explanation.firstForecastChangeKrwPerL, '원/L')} ·{' '}
                    {formatSignedRatioText(explanation.firstForecastChangeRatio)}
                  </p>
                  {explanation.externalAdjustmentCapReached ? (
                    <p className="admin-decision__note">
                      개별 신호 보정은 상한 적용 전 금액이며, 실제 외부 보정은 설정 상한으로 제한됩니다.
                    </p>
                  ) : null}
                  {explanation.formulaMatchesStoredForecast ? null : (
                    <p className="admin-decision__note">
                      기록된 첫 Forecast가 저장된 산출 근거로 재현되지 않습니다.
                    </p>
                  )}
                </>
              )}
            </div>
          </details>
        )}
      </div>
    </SectionCard>
  );
}
