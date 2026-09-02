import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { formatSignedPriceText } from './dashboard/dashboard-format';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import {
  BACKTEST_DETAIL_DISPLAY_LIMIT,
  buildBacktestDetail,
  type BacktestDetailPoint,
  type BacktestDetailRow,
} from '@/lib/forecast/backtest-detail';
import { getOpinetDisplayWeek, getOpinetWeekEnd, getOpinetWeekStart } from '@/lib/opinet/weekly-period';

type WeekDisplay = {
  label: string;
  period: string;
};

function describeWeek(targetDate: string): WeekDisplay {
  const parsed = new Date(targetDate);

  if (Number.isNaN(parsed.getTime())) {
    return { label: '주차 확인 불가', period: '기간 없음' };
  }

  const weekStart = getOpinetWeekStart(parsed);
  const weekEnd = getOpinetWeekEnd(weekStart);

  try {
    const display = getOpinetDisplayWeek(weekStart, weekEnd);

    return {
      label: `${display.month}월 ${display.weekOfMonth}주차`,
      period: `${formatDashboardDate(weekStart.toISOString())} ~ ${formatDashboardDate(weekEnd.toISOString())}`,
    };
  } catch {
    return {
      label: formatDashboardDate(parsed.toISOString()),
      period: `${formatDashboardDate(weekStart.toISOString())} ~ ${formatDashboardDate(weekEnd.toISOString())}`,
    };
  }
}

function BacktestRow({ row }: { row: BacktestDetailRow }) {
  const week = describeWeek(row.targetDate);

  return (
    <tr className={row.highlighted ? 'backtest-detail__row backtest-detail__row--peak' : 'backtest-detail__row'}>
      <th scope="row" data-label="주차">
        <span className="backtest-detail__week">
          <strong>{week.label}</strong>
          <span>{week.period}</span>
        </span>
      </th>
      <td data-label="Forecast">{formatPriceText(row.forecastKrwPerL)}</td>
      <td data-label="Actual">{formatPriceText(row.actualKrwPerL)}</td>
      <td data-label="오차">{formatSignedPriceText(row.signedErrorKrwPerL, '원/L')}</td>
      <td data-label="오차율">
        {row.absolutePercentageErrorPct === null
          ? '산정 전'
          : `${row.absolutePercentageErrorPct.toFixed(2)}%`}
      </td>
      <td data-label="방향">
        <span className={`status-tag ${row.directionHit ? 'status-tag--ok' : 'status-tag--warning'}`}>
          {row.directionHit ? '방향 적중' : '방향 실패'}
        </span>
      </td>
    </tr>
  );
}

export function AdminBacktestDetail({ points }: { points: readonly BacktestDetailPoint[] }) {
  const detail = buildBacktestDetail(points);

  return (
    <details className="admin-panel admin-disclosure backtest-detail">
      <summary className="admin-disclosure__summary">
        <strong>최근 {BACKTEST_DETAIL_DISPLAY_LIMIT}주 백테스트 상세</strong>
        <AdminDisclosureToggle />
      </summary>
      <div className="admin-disclosure__body">
        {detail.summary === null ? (
          <p className="backtest-detail__empty">
            백테스트 상세 데이터가 없습니다. 다음 Forecast 실행부터 주차별 상세가 기록됩니다.
          </p>
        ) : (
          <>
            <p className="backtest-detail__summary">
              표본 {detail.summary.sampleCount}주 · MAPE{' '}
              {detail.summary.mapePct === null ? '산정 전' : `${detail.summary.mapePct.toFixed(2)}%`} · MAE{' '}
              {formatPriceText(detail.summary.maeKrwPerL)} · 방향 적중 {detail.summary.directionHitCount}/
              {detail.summary.sampleCount} · 최대 오차 {formatPriceText(detail.summary.maxAbsoluteErrorKrwPerL)}
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table backtest-detail__table">
                <thead>
                  <tr>
                    <th scope="col">주차</th>
                    <th scope="col">Forecast</th>
                    <th scope="col">Actual</th>
                    <th scope="col">오차</th>
                    <th scope="col">오차율</th>
                    <th scope="col">방향 적중 여부</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((row) => (
                    <BacktestRow key={row.targetDate} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-decision__note">
              각 주차는 해당 시점까지의 데이터만으로 만든 1주 ahead walk-forward 예측과 실제값을 비교한
              결과입니다.
            </p>
            <p className="admin-decision__note">오차는 Forecast에서 Actual을 뺀 값입니다.</p>
            <p className="admin-decision__note">
              방향 적중 여부는 직전 Actual 대비 다음 주 상승·하락 방향이 일치했는지를 의미합니다.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
