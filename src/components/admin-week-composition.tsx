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
    : `Forecast 반영 시차 ${indicator.lagWeeks}주 · 비중 ${Number((indicator.weight * 100).toFixed(1))}%`;
}

type ForecastCauseKey = 'trend' | 'dubai' | 'usdKrw' | 'external';

type ForecastCause = {
  key: ForecastCauseKey;
  label: string;
  amountKrwPerL: number;
};

type ForecastBreakdownMetric = {
  key: string;
  label: string;
  value: string;
  details: readonly string[];
  tone: 'default' | 'trend' | 'dominant' | 'result' | 'secondary' | 'inactive';
};

function describeIndicatorCalculation(indicator: ForecastIndicatorCalculation): readonly string[] {
  const attribution = `비중 ${Number((indicator.weight * 100).toFixed(1))}% · 기여 ${formatSignedRatioText(indicator.contributionRatio)}`;
  let measurementPeriod = '측정 기간 기록 없음';

  if (indicator.previousWeekEndDate !== null && indicator.basisWeekEndDate !== null) {
    const [, previousMonth, previousDay] = formatDashboardDate(
      indicator.previousWeekEndDate,
    ).split('.');
    const [, basisMonth, basisDay] = formatDashboardDate(
      indicator.basisWeekEndDate,
    ).split('.');

    if (
      previousMonth !== undefined &&
      previousDay !== undefined &&
      basisMonth !== undefined &&
      basisDay !== undefined
    ) {
      measurementPeriod = `${Number(previousMonth)}/${previousDay} → ${Number(basisMonth)}/${basisDay}`;
    }
  }

  if (
    indicator.previousValue === null ||
    indicator.basisValue === null ||
    indicator.changeRatio === null
  ) {
    return [measurementPeriod, '비교값 없음', attribution];
  }

  return [
    `${measurementPeriod} · ${formatSignedRatioText(indicator.changeRatio)}`,
    `${formatPriceNumber(indicator.previousValue)} → ${formatPriceNumber(indicator.basisValue)}`,
    attribution,
  ];
}

function buildSignalCauses(explanation: FirstForecastExplanation): ForecastCause[] {
  const signalCauses: ForecastCause[] = [];
  if (
    explanation.dubai !== null &&
    Math.abs(explanation.dubai.correctionBeforeCapKrwPerL) >= 0.005
  ) {
    signalCauses.push({
      key: 'dubai',
      label: 'Dubai 보정',
      amountKrwPerL: explanation.dubai.correctionBeforeCapKrwPerL,
    });
  }
  if (
    explanation.usdKrw !== null &&
    Math.abs(explanation.usdKrw.correctionBeforeCapKrwPerL) >= 0.005
  ) {
    signalCauses.push({
      key: 'usdKrw',
      label: 'USD/KRW 보정',
      amountKrwPerL: explanation.usdKrw.correctionBeforeCapKrwPerL,
    });
  }

  return signalCauses;
}

function resolveDominantCause(
  explanation: FirstForecastExplanation,
  signalCauses: readonly ForecastCause[],
): ForecastCause | null {
  if (Math.abs(explanation.firstForecastChangeKrwPerL) < 0.005) {
    return null;
  }

  const externalCauses =
    explanation.externalAdjustmentCapReached && signalCauses.length > 1
      ? [
          {
            key: 'external' as const,
            label: '실제 외부 보정',
            amountKrwPerL: explanation.appliedExternalCorrectionKrwPerL,
          },
        ]
      : signalCauses.map((cause) =>
          explanation.externalAdjustmentCapReached
            ? { ...cause, amountKrwPerL: explanation.appliedExternalCorrectionKrwPerL }
            : cause,
        );
  const candidates = [
    {
      key: 'trend' as const,
      label: '기본 추세',
      amountKrwPerL: explanation.trendDeltaKrwPerL,
    },
    ...externalCauses,
  ].filter((cause) => Math.abs(cause.amountKrwPerL) >= 0.005);
  const direction = Math.sign(explanation.firstForecastChangeKrwPerL);
  const alignedCandidates = candidates.filter(
    (cause) => Math.sign(cause.amountKrwPerL) === direction,
  );
  const comparableCandidates =
    alignedCandidates.length > 0 ? alignedCandidates : candidates;

  return (
    comparableCandidates.reduce<ForecastCause | null>(
      (largest, cause) =>
        largest === null || Math.abs(cause.amountKrwPerL) > Math.abs(largest.amountKrwPerL)
          ? cause
          : largest,
      null,
    ) ?? null
  );
}

function buildBreakdownMetrics(
  explanation: FirstForecastExplanation,
  dominantCause: ForecastCause | null,
): { core: ForecastBreakdownMetric[]; auxiliary: ForecastBreakdownMetric[] } {
  const capQualifier = explanation.externalAdjustmentCapReached ? ' (상한 전)' : '';
  const core: ForecastBreakdownMetric[] = [
    {
      key: 'anchor',
      label: '기준 Actual',
      value: formatPriceText(explanation.anchorPriceKrwPerL),
      details: [],
      tone: 'default',
    },
    {
      key: 'trend',
      label: '기본 추세',
      value: formatSignedPriceText(explanation.trendDeltaKrwPerL, '원/L'),
      details: [],
      tone: dominantCause?.key === 'trend' ? 'dominant' : 'trend',
    },
    {
      key: 'dubai',
      label: 'Dubai 보정',
      value:
        explanation.dubai === null
          ? '미사용 · 0.00원/L'
          : `${formatSignedPriceText(explanation.dubai.correctionBeforeCapKrwPerL, '원/L')}${capQualifier}`,
      details:
        explanation.dubai === null ? [] : describeIndicatorCalculation(explanation.dubai),
      tone:
        dominantCause?.key === 'dubai'
          ? 'dominant'
          : explanation.dubai === null
            ? 'inactive'
            : 'default',
    },
    {
      key: 'usdKrw',
      label: 'USD/KRW 보정',
      value:
        explanation.usdKrw === null
          ? '미사용 · 0.00원/L'
          : `${formatSignedPriceText(explanation.usdKrw.correctionBeforeCapKrwPerL, '원/L')}${capQualifier}`,
      details:
        explanation.usdKrw === null ? [] : describeIndicatorCalculation(explanation.usdKrw),
      tone:
        dominantCause?.key === 'usdKrw'
          ? 'dominant'
          : explanation.usdKrw === null
            ? 'inactive'
            : 'default',
    },
    {
      key: 'appliedExternal',
      label: '실제 외부 보정',
      value: `${formatSignedRatioText(explanation.appliedExternalAdjustmentRatio)} · ${formatSignedPriceText(explanation.appliedExternalCorrectionKrwPerL, '원/L')}`,
      details: [],
      tone: dominantCause?.key === 'external' ? 'dominant' : 'default',
    },
    {
      key: 'firstForecast',
      label: '첫 Forecast',
      value: formatPriceText(explanation.firstForecastKrwPerL),
      details: [],
      tone: 'result',
    },
  ];
  const auxiliary: ForecastBreakdownMetric[] = [
    {
      key: 'baseForecast',
      label: '추세 적용 후',
      value: formatPriceText(explanation.baseForecastKrwPerL),
      details: [],
      tone: 'secondary',
    },
    {
      key: 'rawExternal',
      label: '외부 신호 합산',
      value: formatSignedRatioText(explanation.rawExternalAdjustmentRatio),
      details: [],
      tone: 'secondary',
    },
    {
      key: 'cap',
      label: '외부 보정 상한',
      value: explanation.externalAdjustmentCapReached
        ? `±${Number((explanation.externalAdjustmentCapRatio * 100).toFixed(2))}% 적용`
        : `미적용 · 설정 ±${Number((explanation.externalAdjustmentCapRatio * 100).toFixed(2))}%`,
      details: [],
      tone: 'secondary',
    },
  ];

  return { core, auxiliary };
}

/** 표준 산출 경로(주간 예측값)를 벗어난 주차만 행에서 따로 알린다. */
function isExceptionalWeek(week: AdminWeekCompositionWeek): boolean {
  return week.priceKind === 'forecast' && (week.fallbackUsed || week.forecastSourceKind !== 'weekly_point');
}

function ForecastExplanationDetails({
  explanation,
}: {
  explanation: FirstForecastExplanation;
}) {
  const signalCauses = buildSignalCauses(explanation);
  const dominantCause = resolveDominantCause(explanation, signalCauses);
  const breakdownMetrics = buildBreakdownMetrics(explanation, dominantCause);
  const displayedTrend = Number(explanation.trendDeltaKrwPerL.toFixed(2));
  const displayedExternal = Number(explanation.appliedExternalCorrectionKrwPerL.toFixed(2));
  const displayedChange = Number(explanation.firstForecastChangeKrwPerL.toFixed(2));
  const additiveRelationExact =
    explanation.formulaMatchesStoredForecast &&
    Math.abs(displayedTrend + displayedExternal - displayedChange) < 0.001;
  const singleSignalCause = signalCauses.length === 1 ? signalCauses[0]! : null;
  const equationExternalLabel =
    singleSignalCause !== null &&
    !explanation.externalAdjustmentCapReached &&
    Math.abs(
      singleSignalCause.amountKrwPerL - explanation.appliedExternalCorrectionKrwPerL,
    ) < 0.0005
      ? singleSignalCause.label
      : '실제 외부 보정';
  const changeDirection =
    explanation.firstForecastChangeKrwPerL > 0
      ? '상승'
      : explanation.firstForecastChangeKrwPerL < 0
        ? '하락'
        : '변동';

  return (
    <>
      <div className="admin-metric-grid forecast-basis__path" aria-label="핵심 Forecast 산출 경로">
        {breakdownMetrics.core.map((metric) => (
          <div
            key={metric.key}
            className={`admin-metric forecast-basis__metric forecast-basis__metric--${metric.tone}`}
          >
            <span className="dashboard-shell__metric-label">{metric.label}</span>
            <strong className="forecast-basis__value">{metric.value}</strong>
            {metric.details.length === 0 ? null : (
              <span
                className="forecast-basis__signal-detail"
                aria-label={`${metric.label} 시장 지표 변화 측정 기간 및 기여 정보`}
              >
                {metric.details.map((detail) => (
                  <span key={detail}>{detail}</span>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="forecast-basis__movement-summary">
        <p className="admin-decision__note">
          예측 시작 구간 변동 ·{' '}
          {formatSignedPriceText(explanation.firstForecastChangeKrwPerL, '원/L')} ·{' '}
          {formatSignedRatioText(explanation.firstForecastChangeRatio)}
        </p>
        {dominantCause === null ? null : (
          <p className="forecast-basis__cause-summary">
            <span>첫 Forecast {changeDirection}의 주원인 ·</span>
            <strong>
              {dominantCause.label}{' '}
              {formatSignedPriceText(dominantCause.amountKrwPerL, '원/L')}
            </strong>
          </p>
        )}
        {additiveRelationExact ? (
          <p className="forecast-basis__equation">
            기본 추세 {formatSignedPriceText(explanation.trendDeltaKrwPerL, '원/L')}
            <span aria-hidden="true">+</span>
            {equationExternalLabel}{' '}
            {formatSignedPriceText(explanation.appliedExternalCorrectionKrwPerL, '원/L')}
            <span aria-hidden="true">=</span>첫 Forecast 변화{' '}
            {formatSignedPriceText(explanation.firstForecastChangeKrwPerL, '원/L')}
          </p>
        ) : null}
      </div>

      <div
        className="admin-metric-grid forecast-basis__auxiliary"
        aria-label="보조 Forecast 산출 정보"
      >
        {breakdownMetrics.auxiliary.map((metric) => (
          <div
            key={metric.key}
            className="admin-metric forecast-basis__metric forecast-basis__metric--secondary"
          >
            <span className="dashboard-shell__metric-label">{metric.label}</span>
            <strong className="forecast-basis__value">{metric.value}</strong>
          </div>
        ))}
      </div>

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
  );
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
              {forecastBasis.explanation === null ||
              forecastBasis.explanation === undefined ? null : (
                <ForecastExplanationDetails explanation={forecastBasis.explanation} />
              )}
              <div
                className="admin-metric-grid forecast-basis__settings"
                aria-label="Forecast 적용 설정"
              >
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
