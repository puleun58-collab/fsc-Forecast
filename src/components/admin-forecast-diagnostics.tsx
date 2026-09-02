import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import {
  FORECAST_PROMOTION_THRESHOLDS,
  type ForecastCandidateView,
  type ForecastModelDiagnostics,
  type ForecastModelParamsView,
  type ForecastWindowMetricsView,
} from '@/lib/forecast/forecast-diagnostics';
import { formatDashboardDateTime } from '@/lib/dashboard/dashboard-time';

export interface ForecastRunHistoryEntry {
  runId: string;
  completedAt: string | null;
  diagnostics: ForecastModelDiagnostics;
}

export interface AdminReliabilitySummary {
  grade: string;
  sampleCount: number;
  recent13wWeeklyPriceMae: number | null;
  recent13wWeeklyPriceMape: number | null;
}

type AdminForecastDiagnosticsProps = {
  latest: ForecastRunHistoryEntry | null;
  history: readonly ForecastRunHistoryEntry[];
  reliability: AdminReliabilitySummary | null;
};

const MISSING_METRIC_TEXT = '데이터 부족';
const MODEL_HISTORY_PREVIEW_COUNT = 3;
const ADMIN_DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});


function formatDateTime(value: string | null): string {
  if (value === null) {
    return '기록 없음';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '기록 없음';
  }

  return ADMIN_DATE_FORMATTER.format(date)
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

function DiagnosticMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-decision__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

type ModelHistoryGroup = {
  key: string;
  dateLabel: string;
  resultText: string;
  reasonText: string;
  promoted: boolean;
  count: number;
};

/** 같은 날 같은 판단이 반복된 실행은 화면에서만 한 줄로 묶는다. */
function groupModelHistory(history: readonly ForecastRunHistoryEntry[]): ModelHistoryGroup[] {
  const groups: ModelHistoryGroup[] = [];

  for (const entry of history) {
    const dateLabel = formatDateTime(entry.completedAt);
    const resultText = describeRunResult(entry.diagnostics);
    const last = groups.at(-1);

    if (last !== undefined && last.dateLabel === dateLabel && last.resultText === resultText) {
      last.count += 1;
      continue;
    }

    groups.push({
      key: entry.runId,
      dateLabel,
      resultText,
      reasonText: entry.diagnostics.promotionReasonText,
      promoted: entry.diagnostics.promoted,
      count: 1,
    });
  }

  return groups;
}

function ModelHistoryRow({
  dateLabel,
  resultText,
  reasonText,
  promoted,
}: {
  dateLabel: string;
  resultText: string;
  reasonText: string;
  promoted: boolean;
}) {
  return (
    <li className="model-history-row">
      <span className="model-history-row__date">{dateLabel}</span>
      <strong className="model-history-row__result">{resultText}</strong>
      <span className="model-history-row__reason">{reasonText}</span>
      <span className={`status-tag ${promoted ? 'status-tag--ok' : ''}`.trim()}>
        {promoted ? '승격' : '유지'}
      </span>
    </li>
  );
}

export function AdminForecastDiagnostics({
  latest,
  history,
  reliability,
}: AdminForecastDiagnosticsProps) {
  if (latest === null) {
    return (
      <SectionCard
        title="예측 모델 진단"
        badge="진단 기록 없음"
        description="현재 모델의 성능과 선택 결과를 확인합니다."
        emptyStateTitle="모델 선택 진단 기록이 없습니다."
        emptyStateCopy="forecast pipeline이 최소 한 번 실행되면 후보 비교와 승격 판단이 표시됩니다."
      />
    );
  }

  const { diagnostics } = latest;
  const { selectedParams } = diagnostics;
  const modelHistoryGroups = groupModelHistory(history);

  return (
    <SectionCard
      title="예측 모델 진단"
      badge={`Model ${selectedParams.modelId}`}
      description="현재 모델의 성능과 선택 결과를 확인합니다."
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

        <div className="admin-panel admin-decision admin-reliability">
          <div className="admin-decision__header">
            <strong>신뢰도 기준 · 최근 13주</strong>
            <span
              className="status-tag"
              title="사용자 화면과 동일한 신뢰도 등급입니다."
            >
              {reliability?.grade ?? '등급 데이터 없음'}
            </span>
          </div>
          <p className="admin-decision__note">
            신뢰도 산정에 사용하는 최근 13주 1주 ahead 성능입니다.
          </p>
          {reliability === null && diagnostics.recentOneStep === null ? (
            <p className="admin-decision__summary">신뢰도 기준 성능 데이터 없음</p>
          ) : (
            <div className="admin-decision__metrics admin-reliability__metrics">
              <DiagnosticMetric
                label="MAPE"
                value={formatPercent(
                  reliability?.recent13wWeeklyPriceMape ?? diagnostics.recentOneStep?.mapePct ?? null,
                )}
              />
              <DiagnosticMetric
                label="MAE"
                value={formatMetric(
                  reliability?.recent13wWeeklyPriceMae ?? diagnostics.recentOneStep?.maeKrwPerL ?? null,
                  2,
                  '원/L',
                )}
              />
              <DiagnosticMetric
                label="평가 표본"
                value={
                  diagnostics.recentOneStep === null
                    ? reliability === null
                      ? MISSING_METRIC_TEXT
                      : `${reliability.sampleCount}개`
                    : `${diagnostics.recentOneStep.sampleCount}주`
                }
              />
            </div>
          )}
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

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>전체 Horizon 성능 · 참고</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <div className="admin-decision__metrics admin-decision__metrics--wide admin-disclosure__metrics">
              <DiagnosticMetric label="MAPE" value={formatPercent(diagnostics.recent?.mapePct ?? null)} />
              <DiagnosticMetric label="MAE" value={formatMetric(diagnostics.recent?.maeKrwPerL ?? null, 2, '원/L')} />
              <DiagnosticMetric
                label="최대 오차"
                value={formatMetric(diagnostics.recent?.maxAbsoluteErrorKrwPerL ?? null, 2, '원/L')}
              />
              <DiagnosticMetric
                label="예측 변동성"
                value={formatMetric(diagnostics.recent?.forecastChurnKrwPerL ?? null, 2, '원/L')}
              />
              <DiagnosticMetric
                label="장기 구간 MAE"
                value={formatMetric(diagnostics.long?.maeKrwPerL ?? null, 2, '원/L')}
              />
              <DiagnosticMetric
                label="평가 표본"
                value={describeSampleCount(diagnostics.recent?.sampleCount ?? 0)}
              />
            </div>
            <p className="admin-decision__note">
              1주부터 최대 13주 ahead 예측을 모두 포함한 통합 성능이며, 신뢰도 등급 산정에는 직접
              사용하지 않습니다.
            </p>
          </div>
        </details>

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
          <strong>최근 모델 선택 이력</strong>
          {modelHistoryGroups.length === 0 ? (
            <span>기록 없음</span>
          ) : (
            <>
              <ul className="model-history-list">
                {modelHistoryGroups.slice(0, MODEL_HISTORY_PREVIEW_COUNT).map((group) => (
                  <ModelHistoryRow
                    key={group.key}
                    dateLabel={group.dateLabel}
                    resultText={group.count > 1 ? `${group.resultText} · ${group.count}회` : group.resultText}
                    reasonText={group.reasonText}
                    promoted={group.promoted}
                  />
                ))}
              </ul>
              {/* 묶인 실행이나 미리보기에서 빠진 그룹이 있으면 실행 단위 원본을 펼쳐 볼 수 있어야 한다. */}
              {history.length > MODEL_HISTORY_PREVIEW_COUNT ||
              modelHistoryGroups.length > MODEL_HISTORY_PREVIEW_COUNT ? (
                <details className="admin-disclosure admin-disclosure--inline">
                  <summary className="admin-disclosure__summary">
                    <strong>전체 이력 {history.length}건</strong>
                    <AdminDisclosureToggle />
                  </summary>
                  <div className="admin-disclosure__body">
                    <ul className="model-history-list">
                      {history.map((entry) => (
                        <ModelHistoryRow
                          key={entry.runId}
                          dateLabel={formatDashboardDateTime(entry.completedAt)}
                          resultText={describeRunResult(entry.diagnostics)}
                          reasonText={entry.diagnostics.promotionReasonText}
                          promoted={entry.diagnostics.promoted}
                        />
                      ))}
                    </ul>
                  </div>
                </details>
              ) : null}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
