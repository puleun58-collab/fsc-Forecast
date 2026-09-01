import { calculateEstimatedFscRate } from '@/lib/fsc/estimated-fsc-rate';
import { readForecastModelState } from '@/lib/forecast/forecast-model-state';
import { formatDashboardDateTime } from '@/lib/dashboard/dashboard-time';

export const ADMIN_OPERATION_HISTORY_LIMIT = 20;

export type AdminOperationStatus = 'success' | 'failed' | 'running' | 'pending';

export type AdminOperationType = 'ingest' | 'forecast' | 'fsc-recompute' | 'fsc-approval';

export type AdminOperationDetail = {
  label: string;
  value: string;
};

export type AdminOperationEvent = {
  id: string;
  type: AdminOperationType;
  label: string;
  occurredAt: string;
  status: AdminOperationStatus;
  summary: string | null;
  details: readonly AdminOperationDetail[];
  errorMessage: string | null;
};

export type AdminIngestRunRecord = {
  id: string;
  status: string;
  triggerKind: string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  errorSummary?: string | null;
};

export type AdminForecastRunRecord = {
  id: string;
  status: string;
  mapePct: string | number | null;
  metadata: unknown;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  errorSummary?: string | null;
};

export type AdminFscResultRecord = {
  id: string;
  targetYear: number;
  targetQuarter: number;
  diffRatio: string;
  oilWeightRate: string;
  quarterAverageKrwPerL: string;
  reliabilityGrade: string;
  reliabilitySampleCount: number;
  reliabilityMinimumSampleCount: number;
  recent13wWeeklyPriceMape: string | null;
  approvalStatus: string;
  approvedAt: Date | string | null;
  createdAt: Date | string;
};

export type BuildAdminOperationHistoryInput = {
  ingestRuns: readonly AdminIngestRunRecord[];
  forecastRuns: readonly AdminForecastRunRecord[];
  fscResults: readonly AdminFscResultRecord[];
  limit?: number;
};

const INGEST_FAILURE_MESSAGE = '오피넷 데이터 수집이 실패했습니다.';
const FORECAST_FAILURE_MESSAGE = 'Forecast pipeline 실행이 실패했습니다.';

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRunStatus(status: string): AdminOperationStatus {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
}

function describeTrigger(triggerKind: string): string {
  return triggerKind === 'scheduled' ? '자동 실행' : '수동 실행';
}

function formatSignedPercent(ratio: number): string {
  const percent = ratio * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

function formatSignedPercentPoint(currentRatio: number, previousRatio: number): string {
  const diff = (currentRatio - previousRatio) * 100;
  return `${diff > 0 ? '+' : ''}${diff.toFixed(2)}%p`;
}

function formatQuarterAverage(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `${parsed.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원/L`
    : '기록 없음';
}

function describeReliability(result: AdminFscResultRecord): string | null {
  if (
    result.reliabilitySampleCount < result.reliabilityMinimumSampleCount ||
    result.reliabilityGrade === 'U' ||
    result.recent13wWeeklyPriceMape === null
  ) {
    return null;
  }

  const mape = Number(result.recent13wWeeklyPriceMape);
  return Number.isFinite(mape)
    ? `${result.reliabilityGrade} · MAPE ${mape.toFixed(1)}%`
    : result.reliabilityGrade;
}

function describeApproval(status: string): string {
  switch (status) {
    case 'approved':
      return '승인 완료';
    case 'rejected':
      return '반려';
    default:
      return '승인 대기';
  }
}

function quarterLabel(year: number, quarter: number): string {
  return `${year}년 ${quarter}분기`;
}

function readEstimatedFscRatio(result: AdminFscResultRecord): number | null {
  try {
    const rate = calculateEstimatedFscRate({
      diffRatio: result.diffRatio,
      oilWeightRate: result.oilWeightRate,
    });
    const parsed = Number(rate);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildIngestEvent(run: AdminIngestRunRecord): AdminOperationEvent | null {
  const occurredAt = toIsoString(run.completedAt) ?? toIsoString(run.startedAt) ?? toIsoString(run.createdAt);

  if (occurredAt === null) {
    return null;
  }

  const status = mapRunStatus(run.status);

  return {
    id: `ingest:${run.id}`,
    type: 'ingest',
    label: '데이터 수집',
    occurredAt,
    status,
    summary: '오피넷 일별 경유가',
    details: [{ label: '실행 방식', value: describeTrigger(run.triggerKind) }],
    errorMessage: status === 'failed' ? INGEST_FAILURE_MESSAGE : null,
  };
}

function buildForecastEvent(run: AdminForecastRunRecord): AdminOperationEvent | null {
  const occurredAt = toIsoString(run.completedAt) ?? toIsoString(run.startedAt) ?? toIsoString(run.createdAt);

  if (occurredAt === null) {
    return null;
  }

  const status = mapRunStatus(run.status);
  const modelState = readForecastModelState(run.metadata);
  const modelLabel = modelState === null ? null : `Model ${modelState.params.modelId}`;
  const mape = run.mapePct === null ? null : Number(run.mapePct);
  const details: AdminOperationDetail[] = [];

  if (mape !== null && Number.isFinite(mape)) {
    details.push({ label: '백테스트 MAPE', value: `${mape.toFixed(2)}%` });
  }

  if (modelState?.modelVersion) {
    details.push({ label: '모델 버전', value: modelState.modelVersion });
  }

  return {
    id: `forecast:${run.id}`,
    type: 'forecast',
    label: 'Forecast 실행',
    occurredAt,
    status,
    summary: modelLabel,
    details,
    errorMessage: status === 'failed' ? FORECAST_FAILURE_MESSAGE : null,
  };
}

function buildFscRecomputeEvent(
  result: AdminFscResultRecord,
  previousRatio: number | null,
): AdminOperationEvent | null {
  const occurredAt = toIsoString(result.createdAt);

  if (occurredAt === null) {
    return null;
  }

  const ratio = readEstimatedFscRatio(result);
  const rateLabel = ratio === null ? null : formatSignedPercent(ratio);
  const details: AdminOperationDetail[] = [
    { label: '대상 분기', value: quarterLabel(result.targetYear, result.targetQuarter) },
  ];

  if (rateLabel !== null) {
    details.push({ label: '예상 FSC율', value: rateLabel });
  }

  details.push({ label: '분기 예상 평균', value: formatQuarterAverage(result.quarterAverageKrwPerL) });

  if (ratio !== null) {
    details.push({
      label: '직전 결과 대비',
      value: previousRatio === null ? '직전 결과 없음' : formatSignedPercentPoint(ratio, previousRatio),
    });
  }

  const reliability = describeReliability(result);

  if (reliability !== null) {
    details.push({ label: '신뢰도', value: reliability });
  }

  details.push({ label: '승인 상태', value: describeApproval(result.approvalStatus) });

  return {
    id: `fsc-recompute:${result.id}`,
    type: 'fsc-recompute',
    label: 'FSC 재계산',
    occurredAt,
    status: 'success',
    summary: [quarterLabel(result.targetYear, result.targetQuarter), rateLabel].filter(Boolean).join(' · '),
    details,
    errorMessage: null,
  };
}

function buildFscApprovalEvent(result: AdminFscResultRecord): AdminOperationEvent | null {
  const occurredAt = toIsoString(result.approvedAt);

  if (occurredAt === null || result.approvalStatus !== 'approved') {
    return null;
  }

  const ratio = readEstimatedFscRatio(result);
  const details: AdminOperationDetail[] = [
    { label: '대상 분기', value: quarterLabel(result.targetYear, result.targetQuarter) },
    { label: '승인 상태', value: '완료' },
    { label: '승인 시각', value: formatDashboardDateTime(occurredAt) },
  ];

  if (ratio !== null) {
    details.push({ label: '승인된 예상 FSC율', value: formatSignedPercent(ratio) });
  }

  return {
    id: `fsc-approval:${result.id}`,
    type: 'fsc-approval',
    label: 'FSC 승인',
    occurredAt,
    status: 'success',
    summary: quarterLabel(result.targetYear, result.targetQuarter),
    details,
    errorMessage: null,
  };
}

export function buildAdminOperationHistory({
  ingestRuns,
  forecastRuns,
  fscResults,
  limit = ADMIN_OPERATION_HISTORY_LIMIT,
}: BuildAdminOperationHistoryInput): AdminOperationEvent[] {
  const orderedResults = [...fscResults].sort((left, right) => {
    const leftAt = toIsoString(left.createdAt) ?? '';
    const rightAt = toIsoString(right.createdAt) ?? '';
    return leftAt.localeCompare(rightAt);
  });
  const previousRatioByQuarter = new Map<string, number>();
  const events: AdminOperationEvent[] = [];

  for (const run of ingestRuns) {
    const event = buildIngestEvent(run);

    if (event !== null) {
      events.push(event);
    }
  }

  for (const run of forecastRuns) {
    const event = buildForecastEvent(run);

    if (event !== null) {
      events.push(event);
    }
  }

  for (const result of orderedResults) {
    const quarterKey = `${result.targetYear}-${result.targetQuarter}`;
    const previousRatio = previousRatioByQuarter.get(quarterKey) ?? null;
    const recompute = buildFscRecomputeEvent(result, previousRatio);
    const ratio = readEstimatedFscRatio(result);

    if (ratio !== null) {
      previousRatioByQuarter.set(quarterKey, ratio);
    }

    if (recompute !== null) {
      events.push(recompute);
    }

    const approval = buildFscApprovalEvent(result);

    if (approval !== null) {
      events.push(approval);
    }
  }

  const uniqueEvents = new Map<string, AdminOperationEvent>();

  for (const event of events) {
    if (!uniqueEvents.has(event.id)) {
      uniqueEvents.set(event.id, event);
    }
  }

  return [...uniqueEvents.values()]
    .sort((left, right) =>
      left.occurredAt === right.occurredAt
        ? right.id.localeCompare(left.id)
        : right.occurredAt.localeCompare(left.occurredAt),
    )
    .slice(0, limit);
}
