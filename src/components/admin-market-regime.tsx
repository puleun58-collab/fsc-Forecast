import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import {
  MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT,
  type MarketRegime,
  type MarketRegimeAnalysis,
  type MarketRegimeSummary,
} from '@/lib/forecast/market-regime';
import { getOpinetDisplayWeek, getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

const REGIME_LABEL: Record<MarketRegime, string> = {
  stable: '안정',
  rising: '상승 추세',
  falling: '하락 추세',
  'high-volatility': '고변동',
  unclassified: '분류 보류',
};

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return '산출 불가';
  }

  const percent = value * 100;

  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function formatPercent(value: number | null): string {
  return value === null ? '산출 불가' : `${(value * 100).toFixed(1)}%`;
}

function formatMae(value: number | null): string {
  return value === null ? '산정 전' : formatPriceText(value);
}

function formatMape(value: number | null): string {
  return value === null ? '산정 전' : `${value.toFixed(2)}%`;
}

function describeWeekLabel(isoDate: string): string {
  const parsed = new Date(isoDate);

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

function RegimeRow({ summary }: { summary: MarketRegimeSummary }) {
  const lowSample = summary.sampleCount < MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT;

  return (
    <tr>
      <th scope="row" data-label="국면">
        {REGIME_LABEL[summary.regime]}
      </th>
      <td data-label="표본">
        <span className="admin-table__inline">
          {summary.sampleCount}주
          {lowSample ? <span className="status-tag admin-table__flag">표본 부족</span> : null}
        </span>
      </td>
      <td data-label="MAE">{formatMae(summary.maeKrwPerL)}</td>
      <td data-label="MAPE">{formatMape(summary.mapePct)}</td>
      <td data-label="방향 정확도">{formatPercent(summary.directionAccuracyRatio)}</td>
      <td data-label="최대 오차">{formatMae(summary.maxAbsoluteErrorKrwPerL)}</td>
    </tr>
  );
}

function RegimeReferenceFacts({ summary }: { summary: MarketRegimeSummary }) {
  return (
    <div className="market-regime-detail">
      <strong>{REGIME_LABEL[summary.regime]}</strong>
      <dl className="quality-trend-status__facts">
        {[
          ['평균 추세 변화', formatMae(summary.averageTrendDeltaKrwPerL)],
          ['평균 Dubai 기여', formatPercent(summary.averageDubaiContributionRatio)],
          ['평균 USD/KRW 기여', formatPercent(summary.averageUsdKrwContributionRatio)],
          ['평균 외부 보정', formatPercent(summary.averageExternalAdjustmentRatio)],
          ['Cap 도달', `${summary.capReachedCount}회`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AdminMarketRegime({ analysis }: { analysis: MarketRegimeAnalysis | null }) {
  const description =
    '예측 당시의 경유 가격 흐름을 시장 상태별로 나누어 어떤 상황에서 예측 오차가 커지는지 비교합니다.';

  if (analysis === null) {
    return (
      <SectionCard
        title="시장 국면별 Forecast 성능"
        badge="분석 없음"
        description={description}
        className="admin-market-regime"
        emptyStateTitle="시장 국면별 분석 데이터가 없습니다."
        emptyStateCopy="다음 예측 실행부터 국면별 성능 분석이 기록됩니다."
      />
    );
  }

  const weakest =
    analysis.weakestRegime === null
      ? null
      : (analysis.regimes.find((summary) => summary.regime === analysis.weakestRegime) ?? null);
  const weakestGap =
    weakest === null || weakest.maeKrwPerL === null || analysis.overall.maeKrwPerL === null
      ? null
      : weakest.maeKrwPerL - analysis.overall.maeKrwPerL;
  const rated = analysis.regimes.filter(
    (summary) =>
      summary.sampleCount >= MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT && summary.maeKrwPerL !== null,
  );
  const unrated = analysis.regimes.filter(
    (summary) => summary.sampleCount < MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT,
  );
  const summaryLine = [
    `시장 국면 · 현재 ${REGIME_LABEL[analysis.currentRegime]}`,
    ...rated.map((summary) => `${REGIME_LABEL[summary.regime]} MAE ${formatMae(summary.maeKrwPerL)}`),
    ...(unrated.length === 0
      ? []
      : [`${unrated.map((summary) => REGIME_LABEL[summary.regime]).join('/')} 표본 부족`]),
  ].join(' · ');

  return (
    <SectionCard
      title="시장 국면별 Forecast 성능"
      badge={`현재: ${REGIME_LABEL[analysis.currentRegime]}`}
      description={description}
      className="admin-market-regime"
    >
      <div className="admin-detail-stack">
        <p className="market-regime__summary">{summaryLine}</p>

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>시장 국면별 성능 보기</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <div className="admin-metric-grid">
              {[
                ['현재 국면', REGIME_LABEL[analysis.currentRegime]],
                ['최근 4주 변화', formatSignedPercent(analysis.currentFeatures.trend4wRatio)],
                ['최근 4주 변동성', formatPercent(analysis.currentFeatures.volatility4wRatio)],
                [
                  '기준 주차',
                  analysis.currentWeekEndDate === null
                    ? '확인 불가'
                    : describeWeekLabel(analysis.currentWeekEndDate),
                ],
              ].map(([label, value]) => (
                <div key={label} className="admin-metric">
                  <span className="dashboard-shell__metric-label">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table market-regime-table">
                <caption className="admin-table__caption">
                  최근 {analysis.windowWeeks}주 다음 주 예측 기준 · 전체 MAE{' '}
                  {formatMae(analysis.overall.maeKrwPerL)} (표본 {analysis.overall.sampleCount}주)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">국면</th>
                    <th scope="col">표본</th>
                    <th scope="col">MAE</th>
                    <th scope="col">MAPE</th>
                    <th scope="col">방향 정확도</th>
                    <th scope="col">최대 오차</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.regimes.map((summary) => (
                    <RegimeRow key={summary.regime} summary={summary} />
                  ))}
                </tbody>
              </table>
            </div>

            {analysis.regimes.some(
              (summary) =>
                summary.sampleCount > 0 &&
                summary.sampleCount < MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT,
            ) ? (
              <p className="admin-decision__note">표본이 적어 국면 특성을 판단하기 어렵습니다.</p>
            ) : null}

            <div className="admin-panel">
              <strong>오차가 가장 컸던 국면</strong>
              {weakest === null ? (
                <p className="admin-decision__note">표본이 충분한 국면이 아직 없습니다.</p>
              ) : (
                <p className="admin-decision__note">
                  {REGIME_LABEL[weakest.regime]} · 표본 {weakest.sampleCount}주 · MAE{' '}
                  {formatMae(weakest.maeKrwPerL)} · 최대 오차{' '}
                  {formatMae(weakest.maxAbsoluteErrorKrwPerL)}
                  {weakestGap === null
                    ? ''
                    : ` · 전체 대비 ${weakestGap > 0 ? '+' : ''}${formatPriceText(weakestGap)}`}
                </p>
              )}
            </div>

            {analysis.largestErrors.length === 0 ? (
              <p className="backtest-detail__empty">아직 비교할 예측 주차가 없습니다.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table market-regime-errors">
                  <thead>
                    <tr>
                      <th scope="col">주차</th>
                      <th scope="col">국면</th>
                      <th scope="col">예측</th>
                      <th scope="col">실제</th>
                      <th scope="col">오차</th>
                      <th scope="col">방향 적중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.largestErrors.map((entry) => (
                      <tr key={entry.targetDate}>
                        <th scope="row" data-label="주차">
                          {describeWeekLabel(entry.targetDate)}
                        </th>
                        <td data-label="국면">{REGIME_LABEL[entry.regime]}</td>
                        <td data-label="예측">{formatPriceText(entry.forecastKrwPerL)}</td>
                        <td data-label="실제">{formatPriceText(entry.actualKrwPerL)}</td>
                        <td data-label="오차">
                          {entry.signedErrorKrwPerL > 0 ? '+' : ''}
                          {formatPriceText(entry.signedErrorKrwPerL)}
                        </td>
                        <td data-label="방향 적중">
                          <span
                            className={`status-tag ${entry.directionHit ? 'status-tag--ok' : ''}`.trim()}
                          >
                            {entry.directionHit ? '적중' : '실패'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="admin-decision__note">
              아래 값은 같은 국면에서 함께 관측된 예측 구성 정보이며 오차 해석 참고용입니다.
            </p>
            {analysis.regimes
              .filter((summary) => summary.sampleCount > 0)
              .map((summary) => (
                <RegimeReferenceFacts key={summary.regime} summary={summary} />
              ))}

            <p className="admin-decision__note">
              국면별 성능은 예측 특성을 이해하기 위한 참고 진단이며 공식 신뢰도 등급과 별도로
              표시됩니다.
            </p>
          </div>
        </details>
      </div>
    </SectionCard>
  );
}
