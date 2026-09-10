import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { AdminBacktestDetail } from './admin-backtest-detail';
import { AdminForecastErrorAnalysis } from './admin-forecast-error-analysis';
import { formatSignedPriceText, mapReliabilityAdjustmentReason } from './dashboard/dashboard-format';
import { SectionCard } from './section-card';

import { formatDashboardDate } from '@/lib/dashboard/dashboard-time';
import { formatPriceText } from '@/lib/dashboard/display-format';
import type {
  ForecastQualityDirection,
  ForecastQualityMetric,
  ForecastQualityTrend,
} from '@/lib/forecast-quality-trend/forecast-quality-trend';
import type { BacktestDetailPoint } from '@/lib/forecast/backtest-detail';
import type { ForecastErrorAnalysis } from '@/lib/forecast/forecast-error-analysis';
import type {
  ForecastQualityAssessment,
  ForecastQualityDataNoticeCode,
  ForecastQualitySignalCode,
  ForecastQualityStatus,
} from '@/lib/fsc/forecast-quality-signal';

const QUALITY_STATUS_VIEW: Record<
  ForecastQualityStatus,
  { label: string; className: string; summary: string }
> = {
  stable: {
    label: '안정',
    className: 'status-tag--ok',
    summary: '최근 예측 품질에 유의할 만한 악화 신호가 없습니다.',
  },
  attention: {
    label: '주의',
    className: 'status-tag--warning',
    summary: '최근 백테스트에서 품질 확인이 필요한 신호가 있습니다.',
  },
  unrated: {
    label: '산정 전',
    className: '',
    summary: '예측 품질을 판단할 데이터가 아직 충분하지 않습니다.',
  },
};

/** 상단 상태는 guardrail 기준이라 직전 실행 대비 변화가 없어도 주의가 유지될 수 있다. */
const ATTENTION_WITHOUT_CHANGE_SUMMARY =
  '현재 품질 지표는 직전 실행과 큰 변화가 없습니다. 다만 백테스트에서 품질 확인 신호가 유지되고 있습니다.';

const QUALITY_BASIS_NOTE =
  '상단 상태는 직전 실행 대비 변화가 아니라 최근 백테스트 및 신뢰도 guardrail을 기준으로 표시합니다.';

const SIGNAL_TEXT: Record<ForecastQualitySignalCode, string> = {
  recent_4w_error_worsening: '최근 4주 오차 추세 주의',
  long_window_instability: '장기 안정성 주의',
  long_window_caution: '장기 성능 확인 필요',
  incomplete_guardrail_metrics: '안정성 지표 산정 중',
};

const DATA_NOTICE_TEXT: Record<ForecastQualityDataNoticeCode, string> = {
  data_unavailable: '데이터를 확인할 수 없어 품질 판단 결과가 최신 상태가 아닐 수 있습니다.',
  data_stale: '최신 데이터가 오래되어 품질 판단 결과가 최신 상태가 아닐 수 있습니다.',
  data_delayed: '최신 데이터 수집이 지연되어 품질 판단 결과가 최신 상태가 아닐 수 있습니다.',
};

const ERROR_TREND_TEXT: Record<string, string> = {
  worsening: '최근 4주 악화',
  stable: '안정',
};

const FRESHNESS_TEXT: Record<string, string> = {
  fresh: '최신',
  delayed: '지연',
  stale: '오래됨',
  unavailable: '확인 필요',
};

const DIRECTION_TEXT: Record<ForecastQualityDirection, string> = {
  improved: '개선',
  worsened: '악화',
  flat: '유지',
  unknown: '비교 데이터 없음',
};

const CHART_VIEW_WIDTH = 320;
const CHART_VIEW_HEIGHT = 72;
const CHART_PADDING = 6;

function formatMetricValue(metric: ForecastQualityMetric): string {
  if (metric.current === null) {
    return '산정 전';
  }

  if (metric.unit === 'krw-per-l') {
    return metric.key === 'bias4w' || metric.key === 'bias13w'
      ? formatSignedPriceText(metric.current, '원/L')
      : formatPriceText(metric.current);
  }

  return `${metric.current.toFixed(metric.precision)}%`;
}

function formatMetricDelta(metric: ForecastQualityMetric): string {
  if (metric.direction === 'unknown' || metric.delta === null) {
    return DIRECTION_TEXT.unknown;
  }

  if (metric.direction === 'flat') {
    return `— ${DIRECTION_TEXT.flat}`;
  }

  const magnitude = Math.abs(metric.delta);
  const magnitudeText =
    metric.unit === 'krw-per-l'
      ? `${magnitude.toFixed(metric.precision)}원/L`
      : `${magnitude.toFixed(metric.precision)}%p`;

  return `${metric.delta < 0 ? '↓' : '↑'} ${magnitudeText} ${DIRECTION_TEXT[metric.direction]}`;
}

/** 지표 변화는 직전 실행 대비 비교라는 점을 상태 badge와 구분해 알린다. */
function MetricDeltaText({ metric }: { metric: ForecastQualityMetric }) {
  if (metric.direction === 'unknown' || metric.delta === null) {
    return <span className="quality-trend-metric__delta">{DIRECTION_TEXT.unknown}</span>;
  }

  return (
    <span className="quality-trend-metric__delta">
      {formatMetricDelta(metric).replace(` ${DIRECTION_TEXT[metric.direction]}`, '')}{' '}
      <span className="quality-trend-metric__scope">직전 실행 </span>
      대비 {DIRECTION_TEXT[metric.direction]}
    </span>
  );
}

function QualityMetricCell({ metric }: { metric: ForecastQualityMetric }) {
  return (
    <div className={`admin-metric quality-trend-metric quality-trend-metric--${metric.direction}`}>
      <span className="dashboard-shell__metric-label">{metric.label}</span>
      <strong>{formatMetricValue(metric)}</strong>
      <MetricDeltaText metric={metric} />
    </div>
  );
}

function QualityTrendChart({ points }: { points: ForecastQualityTrend['chart'] }) {
  if (points.length <= 1) {
    return <p className="quality-trend-chart__empty">추이 데이터가 아직 충분하지 않습니다.</p>;
  }

  const values = points.map((point) => point.mapePct);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || Math.max(maxValue * 0.1, 0.1);
  const plotWidth = CHART_VIEW_WIDTH - CHART_PADDING * 2;
  const plotHeight = CHART_VIEW_HEIGHT - CHART_PADDING * 2;
  const plotted = points.map((point, index) => ({
    ...point,
    x: CHART_PADDING + (plotWidth * index) / (points.length - 1),
    y: CHART_PADDING + plotHeight - ((point.mapePct - minValue + spread * 0.1) / (spread * 1.2)) * plotHeight,
  }));
  const first = plotted[0]!;
  const last = plotted[plotted.length - 1]!;

  return (
    <div className="quality-trend-chart">
      <span className="quality-trend-chart__caption">최근 13주 MAPE 추이 · 최근 {points.length}회 실행</span>
      <svg
        className="quality-trend-chart__svg"
        viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
        role="img"
        aria-label={`최근 13주 MAPE 추이, ${formatDashboardDate(first.createdAt)} ${first.mapePct.toFixed(2)}%부터 ${formatDashboardDate(last.createdAt)} ${last.mapePct.toFixed(2)}%까지`}
        preserveAspectRatio="none"
      >
        <polyline
          className="quality-trend-chart__line"
          points={plotted.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}
        />
        {plotted.map((point) => (
          <circle
            key={point.createdAt}
            className="quality-trend-chart__point"
            cx={point.x}
            cy={point.y}
            r={2.4}
          />
        ))}
      </svg>
      <p className="quality-trend-chart__summary">
        {formatDashboardDate(first.createdAt)} {first.mapePct.toFixed(2)}% →{' '}
        {formatDashboardDate(last.createdAt)} {last.mapePct.toFixed(2)}%
      </p>
    </div>
  );
}

function QualityStatusPanel({
  assessment,
  metricsChanged,
}: {
  assessment: ForecastQualityAssessment;
  metricsChanged: boolean;
}) {
  const view = QUALITY_STATUS_VIEW[assessment.status];
  const summary =
    assessment.status === 'attention' && !metricsChanged ? ATTENTION_WITHOUT_CHANGE_SUMMARY : view.summary;

  return (
    <div className="admin-panel quality-trend-status">
      <p className="quality-trend-status__summary">{summary}</p>
      {assessment.status === 'attention' && assessment.signals.length > 0 ? (
        <ul className="quality-trend-status__reasons">
          {assessment.signals.map((signal) => (
            <li key={signal}>{SIGNAL_TEXT[signal]}</li>
          ))}
        </ul>
      ) : null}
      {assessment.dataNotice === null ? null : (
        <p className="quality-trend-status__notice">
          <strong>데이터 확인 필요</strong>
          <span>{DATA_NOTICE_TEXT[assessment.dataNotice]}</span>
        </p>
      )}
      <details className="admin-disclosure admin-disclosure--inline">
        <summary className="admin-disclosure__summary">
          <strong>판단 근거</strong>
          <AdminDisclosureToggle />
        </summary>
        <div className="admin-disclosure__body">
          <dl className="quality-trend-status__facts">
            <div>
              <dt>최근 오차 추세</dt>
              <dd>
                {assessment.recent4wErrorTrend === null
                  ? '기록 없음'
                  : ERROR_TREND_TEXT[assessment.recent4wErrorTrend] ?? '기록 없음'}
              </dd>
            </div>
            <div>
              <dt>장기 안정성</dt>
              <dd>
                {assessment.signals.includes('long_window_instability') ||
                assessment.signals.includes('long_window_caution')
                  ? '주의'
                  : '안정'}
              </dd>
            </div>
            <div>
              <dt>데이터 최신성</dt>
              <dd>
                {assessment.dataFreshnessStatus === null
                  ? '기록 없음'
                  : FRESHNESS_TEXT[assessment.dataFreshnessStatus] ?? '기록 없음'}
              </dd>
            </div>
            <div>
              <dt>표본</dt>
              <dd>
                {assessment.reliabilitySampleCount} / {assessment.reliabilityMinimumSampleCount}
              </dd>
            </div>
          </dl>
          <p className="admin-decision__note">{QUALITY_BASIS_NOTE}</p>
        </div>
      </details>
    </div>
  );
}

export function AdminForecastQualityTrend({
  trend,
  backtestPoints,
  errorAnalysis,
}: {
  trend: ForecastQualityTrend;
  backtestPoints: readonly BacktestDetailPoint[];
  errorAnalysis: ForecastErrorAnalysis | null;
}) {
  const hasCurrentValue = trend.metrics.some((metric) => metric.current !== null);
  const assessment = trend.assessment;
  const metricsChanged = trend.metrics.some(
    (metric) => metric.direction === 'improved' || metric.direction === 'worsened',
  );

  if (!hasCurrentValue) {
    return (
      <SectionCard
        title="예측 품질 추이"
        badge={QUALITY_STATUS_VIEW.unrated.label}
        description="현재 예측 품질과 직전 실행 대비 변화를 확인합니다."
        className="admin-quality-trend"
        emptyStateTitle="아직 품질 지표가 없습니다."
        emptyStateCopy="FSC 재계산이 실행되면 최근 13주 MAPE와 오차 지표가 표시됩니다."
      />
    );
  }

  const statusView = QUALITY_STATUS_VIEW[assessment?.status ?? 'unrated'];

  return (
    <SectionCard
      title="예측 품질 추이"
      badge={
        <span className={`status-tag status-tag--prominent ${statusView.className}`.trim()}>{statusView.label}</span>
      }
      description="현재 예측 품질과 직전 실행 대비 변화를 확인합니다."
      className="admin-quality-trend"
    >
      <div className="admin-detail-stack">
        {assessment === null ? (
          <p className="quality-trend-status__summary">{QUALITY_STATUS_VIEW.unrated.summary}</p>
        ) : (
          <QualityStatusPanel assessment={assessment} metricsChanged={metricsChanged} />
        )}

        <div className="admin-metric-grid quality-trend-metrics">
          {trend.metrics.map((metric) => (
            <QualityMetricCell key={metric.key} metric={metric} />
          ))}
        </div>

        <QualityTrendChart points={trend.chart} />

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>보조 지표</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <div className="admin-metric-grid quality-trend-metrics">
              {trend.detailMetrics.map((metric) => (
                <QualityMetricCell key={metric.key} metric={metric} />
              ))}
            </div>
          </div>
        </details>

        <AdminBacktestDetail points={backtestPoints} />

        <AdminForecastErrorAnalysis analysis={errorAnalysis} />
      </div>
    </SectionCard>
  );
}
