import { SectionCard } from './section-card';

import {
  FORECAST_PROMOTION_THRESHOLDS,
  type ForecastCandidateView,
  type ForecastModelDiagnostics,
  type ForecastModelParamsView,
  type ForecastWindowMetricsView,
} from '@/lib/forecast/forecast-diagnostics';

export interface ForecastRunHistoryEntry {
  runId: string;
  completedAt: string | null;
  diagnostics: ForecastModelDiagnostics;
}

type AdminForecastDiagnosticsProps = {
  latest: ForecastRunHistoryEntry | null;
  history: readonly ForecastRunHistoryEntry[];
};

const MISSING_METRIC_TEXT = '데이터 부족';

function formatDateTime(value: string | null): string {
  if (value === null) {
    return '기록 없음';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '기록 없음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('. ', '.')
    .replace(/\.$/, '');
}

function formatMetric(value: number | null, fractionDigits = 2, unit = ''): string {
  if (value === null) {
    return MISSING_METRIC_TEXT;
  }

  return `${value.toFixed(fractionDigits)}${unit}`;
}

function formatPercent(value: number | null, fractionDigits = 2): string {
  return value === null ? MISSING_METRIC_TEXT : `${value.toFixed(fractionDigits)}%`;
}

function formatIndicator(indicator: ForecastModelParamsView['dubai']): string {
  if (indicator === null) {
    return '미사용';
  }

  return `Lag ${indicator.lagWeeks}주 · Weight ${(indicator.weight * 100).toFixed(1)}%`;
}

function describeSampleCount(value: number): string {
  return value === 0 ? MISSING_METRIC_TEXT : `${value}개`;
}

const CANDIDATE_STATUS_TEXT: Record<ForecastCandidateView['status'], string> = {
  selected: '현재',
  candidate: '후보',
  insufficient_sample: '표본 부족',
};

const CANDIDATE_STATUS_TONE: Record<ForecastCandidateView['status'], string> = {
  selected: 'status-tag--ok',
  candidate: '',
  insufficient_sample: 'status-tag--warning',
};

function MetricList({ metrics }: { metrics: ForecastWindowMetricsView | null }) {
  if (metrics === null) {
    return <span>{MISSING_METRIC_TEXT}</span>;
  }

  return (
    <>
      <span>MAE: {formatMetric(metrics.maeKrwPerL, 2, '원/L')}</span>
      <span>MAPE: {formatPercent(metrics.mapePct)}</span>
      <span>최대 절대오차: {formatMetric(metrics.maxAbsoluteErrorKrwPerL, 2, '원/L')}</span>
      <span>예측 변동성: {formatMetric(metrics.forecastChurnKrwPerL, 2, '원/L')}</span>
      <span>백테스트 표본 수: {describeSampleCount(metrics.sampleCount)}</span>
    </>
  );
}

function describeRunResult(diagnostics: ForecastModelDiagnostics): string {
  if (!diagnostics.promoted) {
    return `Model ${diagnostics.selectedParams.modelId} 유지`;
  }

  return diagnostics.previousModelId === null
    ? `Model ${diagnostics.selectedParams.modelId} 승격`
    : `Model ${diagnostics.previousModelId} → Model ${diagnostics.selectedParams.modelId} 승격`;
}

export function AdminForecastDiagnostics({ latest, history }: AdminForecastDiagnosticsProps) {
  if (latest === null) {
    return (
      <SectionCard
        title="예측 모델 진단"
        badge="진단 기록 없음"
        description="예측 실행의 모델 선택 판단을 확인합니다."
        emptyStateTitle="모델 선택 진단 기록이 없습니다."
        emptyStateCopy="forecast pipeline이 최소 한 번 실행되면 후보 비교와 승격 판단이 표시됩니다."
      />
    );
  }

  const { diagnostics } = latest;
  const { selectedParams } = diagnostics;

  return (
    <SectionCard
      title="예측 모델 진단"
      badge={`Model ${selectedParams.modelId}`}
      description="이번 예측 실행에서 모델 선택 엔진이 무엇을 비교했고 왜 유지·승격했는지 보여 줍니다. 값은 forecast pipeline이 기록한 결과를 그대로 사용합니다."
    >
      <div className="admin-detail-stack">
        <div className="admin-metric-grid">
          {[
            ['현재 모델', `Model ${selectedParams.modelId}`],
            ['모델 버전', diagnostics.modelVersion ?? '기록 없음'],
            [
              '최근 승격일',
              diagnostics.promotedAt === null ? '승격 이력 없음' : formatDateTime(diagnostics.promotedAt),
            ],
            ['이번 실행 결과', describeRunResult(diagnostics)],
          ].map(([label, value]) => (
            <div key={label} className="admin-metric">
              <span className="dashboard-shell__metric-label">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="admin-panel">
          <strong>현재 파라미터</strong>
          <span>국내 추세 Lookback: {selectedParams.trendLookbackWeeks}주</span>
          <span>Dubai: {formatIndicator(selectedParams.dubai)}</span>
          <span>USD/KRW: {formatIndicator(selectedParams.usdKrw)}</span>
          <span>
            외부 보정 상한: ±{(selectedParams.externalAdjustmentCapRatio * 100).toFixed(1)}%
          </span>
        </div>

        <div className="admin-panel">
          <strong>현재 모델 성능</strong>
          <span>최근 구간</span>
          <MetricList metrics={diagnostics.recent} />
          <span>장기 구간 MAE: {formatMetric(diagnostics.long?.maeKrwPerL ?? null, 2, '원/L')}</span>
        </div>

        <div className="admin-panel admin-decision">
          <div className="admin-decision__header">
            <strong>판단 사유</strong>
            <details className="admin-thresholds">
              <summary className="status-tag status-tag--interactive">승격 기준 보기</summary>
              <div className="admin-thresholds__panel">
                <p>
                  모델 승격은 최근 예측 성능 개선뿐 아니라 장기 안정성, 최대 오차, 예측 변동성, 승격
                  쿨다운을 함께 고려합니다.
                </p>
                <dl className="admin-thresholds__list">
                  {FORECAST_PROMOTION_THRESHOLDS.map((threshold) => (
                    <div key={threshold.label}>
                      <dt>{threshold.label}</dt>
                      <dd>{threshold.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </details>
          </div>
          <p className="admin-decision__summary">
            <span className={`status-tag ${diagnostics.promoted ? 'status-tag--ok' : ''}`.trim()}>
              {diagnostics.promoted ? '승격' : '유지'}
            </span>
            <span>{diagnostics.promotionReasonText}</span>
          </p>
          <div className="admin-decision__metrics">
            <div className="admin-decision__metric">
              <span>MAE 개선</span>
              <strong>
                {diagnostics.maeImprovementRatio === null
                  ? '비교 데이터 없음'
                  : `${(diagnostics.maeImprovementRatio * 100).toFixed(1)}%`}
              </strong>
            </div>
            <div className="admin-decision__metric">
              <span>MAPE 개선</span>
              <strong>
                {diagnostics.mapeImprovementPctPoint === null
                  ? '비교 데이터 없음'
                  : `${diagnostics.mapeImprovementPctPoint.toFixed(2)}%p`}
              </strong>
            </div>
            <div
              className="admin-decision__metric"
              title="이번 모델 선택 과정에서 평가한 파라미터 조합 수입니다."
            >
              <span>평가 후보</span>
              <strong>{diagnostics.evaluatedCandidateCount}개</strong>
            </div>
          </div>
        </div>

        {diagnostics.candidates.length === 0 ? (
          <div className="admin-panel">
            <strong>후보 모델 비교</strong>
            <span>유효 후보 없음</span>
          </div>
        ) : (
          <div className="admin-panel">
            <strong>후보 모델 비교</strong>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">모델</th>
                    <th scope="col">최근 MAE</th>
                    <th scope="col">최근 MAPE</th>
                    <th scope="col">장기 MAE</th>
                    <th scope="col">최대오차</th>
                    <th scope="col">표본</th>
                    <th scope="col">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.candidates.map((candidate) => (
                    <tr key={candidate.modelId}>
                      <th scope="row">Model {candidate.modelId}</th>
                      <td>{formatMetric(candidate.recentMaeKrwPerL)}</td>
                      <td>{formatPercent(candidate.recentMapePct)}</td>
                      <td>{formatMetric(candidate.longMaeKrwPerL)}</td>
                      <td>{formatMetric(candidate.maxAbsoluteErrorKrwPerL)}</td>
                      <td>{describeSampleCount(candidate.recentSampleCount)}</td>
                      <td>
                        <span
                          className={`status-tag ${CANDIDATE_STATUS_TONE[candidate.status]}`.trim()}
                        >
                          {CANDIDATE_STATUS_TEXT[candidate.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="admin-list">
              {diagnostics.candidates.map((candidate) => (
                <li key={`params-${candidate.modelId}`} className="admin-panel">
                  <strong>Model {candidate.modelId} 파라미터</strong>
                  <span>국내 추세 Lookback: {candidate.params.trendLookbackWeeks}주</span>
                  <span>Dubai: {formatIndicator(candidate.params.dubai)}</span>
                  <span>USD/KRW: {formatIndicator(candidate.params.usdKrw)}</span>
                  <span>
                    외부 보정 상한: ±{(candidate.params.externalAdjustmentCapRatio * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="admin-panel">
          <strong>최근 모델 변경 이력</strong>
          {history.length === 0 ? (
            <span>기록 없음</span>
          ) : (
            <ul className="admin-list">
              {history.map((entry) => (
                <li key={entry.runId} className="admin-panel">
                  <div className="admin-row">
                    <strong>{formatDateTime(entry.completedAt)}</strong>
                    <span
                      className={`status-tag ${entry.diagnostics.promoted ? 'status-tag--ok' : ''}`.trim()}
                    >
                      {entry.diagnostics.promoted ? '승격' : '유지'}
                    </span>
                  </div>
                  <span>{describeRunResult(entry.diagnostics)}</span>
                  <span>{entry.diagnostics.promotionReasonText}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
