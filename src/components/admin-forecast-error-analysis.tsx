import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { formatSignedPriceText } from './dashboard/dashboard-format';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import {
  FORECAST_ERROR_ANALYSIS_DISPLAY_LIMIT,
  summarizeForecastErrorAnalysis,
  type ForecastErrorAnalysis,
  type ForecastErrorAnalysisPoint,
  type ForecastErrorFactor,
  type ForecastErrorFactorKey,
  type ForecastFactorSummary,
} from '@/lib/forecast/forecast-error-analysis';
import { getOpinetDisplayWeek, getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

const FACTOR_LABEL: Record<ForecastErrorFactorKey, string> = {
  trend: '주간 Trend',
  dubai: 'Dubai 보정',
  usdKrw: 'USD/KRW 보정',
  cap: '외부 보정 상한',
};

function describeWeekLabel(targetDate: string): string {
  const parsed = new Date(targetDate);

  if (Number.isNaN(parsed.getTime())) {
    return '주차 확인 불가';
  }

  const weekStart = getOpinetWeekStart(parsed);

  try {
    const display = getOpinetDisplayWeek(weekStart, getOpinetWeekEnd(weekStart));
    return `${display.month}월 ${display.weekOfMonth}주차`;
  } catch {
    return formatDashboardDate(parsed.toISOString());
  }
}

function describeImpact(factor: ForecastErrorFactor): string {
  if (!factor.applied) {
    return '미사용';
  }

  if (factor.errorImpactKrwPerL === null) {
    return '산정 전';
  }

  const magnitude = Math.abs(factor.errorImpactKrwPerL);

  if (magnitude < 0.005) {
    return '오차 변화 없음';
  }

  return `오차 ${formatPriceText(magnitude)} ${factor.errorImpactKrwPerL > 0 ? '확대' : '감소'}`;
}

/** 규칙 기반 요약. 모델 내부 영향까지만 서술하고 경제적 인과는 단정하지 않는다. */
function buildWeekSummary(point: ForecastErrorAnalysisPoint): string {
  const sentences: string[] = [];
  const increased = (['trend', 'dubai', 'usdKrw'] as const).filter(
    (key) => point.factors[key].applied && (point.factors[key].errorImpactKrwPerL ?? 0) > 0,
  );
  const reduced = (['trend', 'dubai', 'usdKrw'] as const).filter(
    (key) => point.factors[key].applied && (point.factors[key].errorImpactKrwPerL ?? 0) < 0,
  );

  if (increased.length > 0) {
    sentences.push(`${increased.map((key) => FACTOR_LABEL[key]).join(', ')}이(가) 이 주차 오차를 확대했습니다.`);
  }

  if (reduced.length > 0) {
    sentences.push(`${reduced.map((key) => FACTOR_LABEL[key]).join(', ')}은(는) 오차를 줄였습니다.`);
  }

  const best = [...point.modelComparisons].sort(
    (left, right) => left.absoluteErrorKrwPerL - right.absoluteErrorKrwPerL,
  )[0];

  if (best !== undefined) {
    sentences.push(`동일 시점에서는 Model ${best.modelId}의 오차가 가장 작았습니다.`);
  }

  return sentences.length === 0 ? '이 주차에서는 구성요소별 오차 변화가 없었습니다.' : sentences.join(' ');
}

function WeekAnalysis({
  point,
  selectedModelId,
}: {
  point: ForecastErrorAnalysisPoint;
  selectedModelId: string;
}) {
  return (
    <details className="admin-disclosure admin-disclosure--inline error-analysis__week">
      <summary className="admin-disclosure__summary">
        <strong>
          {describeWeekLabel(point.targetDate)} · 오차{' '}
          {formatSignedPriceText(point.selectedForecastKrwPerL - point.actualKrwPerL, '원/L')}
        </strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <dl className="error-analysis__facts">
          <div>
            <dt>Actual</dt>
            <dd>{formatPriceText(point.actualKrwPerL)}</dd>
          </div>
          <div>
            <dt>현재 Forecast</dt>
            <dd>{formatPriceText(point.selectedForecastKrwPerL)}</dd>
          </div>
          <div>
            <dt>절대오차</dt>
            <dd>{formatPriceText(point.selectedAbsoluteErrorKrwPerL)}</dd>
          </div>
        </dl>

        <div className="admin-table-wrap">
          <table className="admin-table error-analysis__table">
            <thead>
              <tr>
                <th scope="col">요소</th>
                <th scope="col">적용</th>
                <th scope="col">제거 시 Forecast</th>
                <th scope="col">오차 영향</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(FACTOR_LABEL) as ForecastErrorFactorKey[]).map((key) => {
                const factor = point.factors[key];

                return (
                  <tr key={key}>
                    <th scope="row" data-label="요소">
                      {FACTOR_LABEL[key]}
                    </th>
                    <td data-label="적용">{factor.applied ? (key === 'cap' ? '도달' : '적용') : '미사용'}</td>
                    <td data-label="제거 시 Forecast">
                      {factor.forecastKrwPerL === null ? '-' : formatPriceText(factor.forecastKrwPerL)}
                    </td>
                    <td data-label="오차 영향">{describeImpact(factor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {point.modelComparisons.length === 0 ? null : (
          <ul className="error-analysis__models">
            {point.modelComparisons.map((comparison) => (
              <li key={comparison.modelId}>
                <span>Model {comparison.modelId}</span>
                <strong>{formatPriceText(comparison.forecastKrwPerL)}</strong>
                <span>오차 {formatPriceText(comparison.absoluteErrorKrwPerL)}</span>
                {comparison.modelId === selectedModelId ? (
                  <span className="status-tag status-tag--ok">현재</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="admin-decision__note">{buildWeekSummary(point)}</p>
      </div>
    </details>
  );
}

function FactorSummaryRow({ summary }: { summary: ForecastFactorSummary }) {
  return (
    <div className="admin-metric">
      <span className="dashboard-shell__metric-label">{FACTOR_LABEL[summary.key]}</span>
      {summary.appliedWeekCount === 0 ? (
        <strong>미사용</strong>
      ) : (
        <>
          <strong>
            {summary.averageErrorImpactKrwPerL === null
              ? '산정 전'
              : `평균 ${formatSignedPriceText(summary.averageErrorImpactKrwPerL, '원/L')}`}
          </strong>
          <span className="quality-trend-metric__delta">
            {summary.reducedWeekCount}주 오차 감소 · {summary.increasedWeekCount}주 오차 확대
          </span>
        </>
      )}
    </div>
  );
}

export function AdminForecastErrorAnalysis({ analysis }: { analysis: ForecastErrorAnalysis | null }) {
  if (analysis === null || analysis.points.length === 0) {
    return (
      <details className="admin-panel admin-disclosure">
        <summary className="admin-disclosure__summary">
          <strong>오차 원인 분석</strong>
          <AdminDisclosureToggle />
        </summary>
        <div className="admin-disclosure__body">
          <p className="backtest-detail__empty">
            오차 원인 분석 데이터가 없습니다. 다음 Forecast 실행부터 상세 분석이 기록됩니다.
          </p>
        </div>
      </details>
    );
  }

  const summary = summarizeForecastErrorAnalysis(analysis);

  return (
    <details className="admin-panel admin-disclosure error-analysis">
      <summary className="admin-disclosure__summary">
        <strong>오차 원인 분석 · 최근 {FORECAST_ERROR_ANALYSIS_DISPLAY_LIMIT}주</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        <div className="admin-metric-grid quality-trend-metrics">
          {summary.factors.map((factor) => (
            <FactorSummaryRow key={factor.key} summary={factor} />
          ))}
        </div>

        <div className="error-analysis__largest">
          <strong>오차가 컸던 주차</strong>
          <ol>
            {summary.largestErrorPoints.map((point) => (
              <li key={point.targetDate}>
                {describeWeekLabel(point.targetDate)} {formatPriceText(point.selectedAbsoluteErrorKrwPerL)}
              </li>
            ))}
          </ol>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table error-analysis__model-table">
            <thead>
              <tr>
                <th scope="col">모델</th>
                <th scope="col">MAE</th>
                <th scope="col">MAPE</th>
                <th scope="col">가장 정확했던 주차</th>
              </tr>
            </thead>
            <tbody>
              {summary.modelSummaries.map((model) => (
                <tr key={model.modelId}>
                  <th scope="row" data-label="모델">
                    Model {model.modelId}
                    {model.isSelected ? <span className="status-tag status-tag--ok">현재</span> : null}
                  </th>
                  <td data-label="MAE">{formatPriceText(model.maeKrwPerL)}</td>
                  <td data-label="MAPE">
                    {model.mapePct === null ? '산정 전' : `${model.mapePct.toFixed(2)}%`}
                  </td>
                  <td data-label="가장 정확했던 주차">
                    {model.bestWeekCount}/{model.sampleCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="error-analysis__weeks">
          {summary.points.map((point) => (
            <WeekAnalysis key={point.targetDate} point={point} selectedModelId={summary.selectedModelId} />
          ))}
        </div>

        <p className="admin-decision__note">
          각 값은 다른 조건을 유지한 채 해당 요소만 제거했을 때의 진단 결과이며, 요소별 영향의 단순 합이
          전체 오차와 같지는 않습니다. 모델 파라미터는 이 분석으로 변경되지 않습니다.
        </p>
      </div>
    </details>
  );
}
