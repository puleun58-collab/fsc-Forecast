import { RunStatus } from '@prisma/client';

import { buildSeriesSnapshot, NATIONAL_AVERAGE_DATASET_KEY } from '@/lib/aggregates';
import { db } from '@/lib/db';
import {
  findLatestBaseFscResultByQuarter,
  findStoredBaseFscResultByQuarter,
} from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
import { loadPublicConfirmedLatestDate } from '@/lib/opinet/resolve-public-confirmed-date';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';

import { loadIndicatorSyncStates } from '@/lib/external-indicators/indicator-sync-state';

import { buildDashboardDataSources } from './data-sources';
import {
  calculateDataDelayMinutes,
  calculateDataFreshness,
} from './dashboard-time';
import { buildForecastChangeSummary } from './forecast-change-summary';
import { resolveSelectedQuarter } from './quarter-selection';
import {
  buildPublicMarketSignals,
  buildPublicMarketSummaryText,
} from './market-signals';
import type {
  FscDashboardCurrentPriceSection,
  FscDashboardData,
  FscDashboardMarketSignalsSection,
  FscDashboardQuarterSummary,
  FscDashboardSupportSection,
  FscDashboardTrendSection,
} from './fsc-types';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTimestamp(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const PRICE_SCALE = 100;

function roundPrice(value: number): number {
  return Math.round(value * PRICE_SCALE) / PRICE_SCALE;
}

function deriveDirection(change: number | null): 'up' | 'down' | 'flat' {
  if (change === null || change === 0) {
    return 'flat';
  }

  return change > 0 ? 'up' : 'down';
}

type DashboardCurrentRow = {
  datasetKey: string;
  priceDate: Date;
  currentRevisionId: string;
  latestRecomputeSnapshotId: string | null;
  currentRevision: {
    observedPriceKrwPerL: number | { toString(): string };
    sourceObservedAt: Date | null;
    sourcePayload?: unknown;
  };
};

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function selectDisplayCurrentRows(
  rows: readonly DashboardCurrentRow[],
  latestConfirmedDate: Date | null,
): readonly DashboardCurrentRow[] {
  if (latestConfirmedDate === null) {
    return rows;
  }

  const filteredRows = rows.filter(
    (row) => toDateOnly(row.priceDate).getTime() <= latestConfirmedDate.getTime(),
  );

  return filteredRows.length > 0 ? filteredRows : rows;
}

async function loadQuarterEndCurrentPrice(
  quarterStartDate: Date,
  quarterEndDate: Date,
): Promise<FscDashboardCurrentPriceSection> {
  const rows = await db.dailyPriceCurrent.findMany({
    where: {
      datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
      priceDate: {
        gte: quarterStartDate,
        lte: quarterEndDate,
      },
    },
    orderBy: {
      priceDate: 'desc',
    },
    take: 2,
    include: {
      currentRevision: {
        select: {
          observedPriceKrwPerL: true,
          sourceObservedAt: true,
        },
      },
    },
  });
  const latest = rows[0];
  const previous = rows[1];

  if (!latest) {
    return {
      availability: 'unavailable',
      latestPriceDate: null,
      latestPriceKrwPerL: null,
      previousPriceDate: null,
      previousPriceKrwPerL: null,
      absoluteChangeKrwPerL: null,
      percentChange: null,
      direction: 'flat',
      coverageStartDate: formatDate(quarterStartDate),
      coverageEndDate: formatDate(quarterEndDate),
      sourceObservedAt: null,
      unavailableReason: '선택한 분기 내 일별 Actual 데이터가 없습니다.',
    };
  }

  const latestPriceKrwPerL = Number(latest.currentRevision.observedPriceKrwPerL);
  const previousPriceKrwPerL = previous
    ? Number(previous.currentRevision.observedPriceKrwPerL)
    : null;
  const absoluteChangeKrwPerL =
    previousPriceKrwPerL === null ? null : roundPrice(latestPriceKrwPerL - previousPriceKrwPerL);
  const percentChange =
    previousPriceKrwPerL === null || previousPriceKrwPerL === 0
      ? null
      : ((latestPriceKrwPerL - previousPriceKrwPerL) / previousPriceKrwPerL) * 100;

  return {
    availability: 'available',
    latestPriceDate: formatDate(latest.priceDate),
    latestPriceKrwPerL,
    previousPriceDate: previous ? formatDate(previous.priceDate) : null,
    previousPriceKrwPerL,
    absoluteChangeKrwPerL,
    percentChange,
    direction: deriveDirection(absoluteChangeKrwPerL),
    coverageStartDate: formatDate(quarterStartDate),
    coverageEndDate: formatDate(quarterEndDate),
    sourceObservedAt: latest.currentRevision.sourceObservedAt?.toISOString() ?? null,
  };
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '알 수 없는 오류가 발생했습니다.';
}

function readMonthlyBasis(
  payload: unknown,
): {
  quarterAverageKrwPerL: string | null;
  monthRows: Array<{ monthLabel: string; priceKrwPerL: string }>;
} {
  if (!payload || typeof payload !== 'object') {
    return {
      quarterAverageKrwPerL: null,
      monthRows: [],
    };
  }

  const candidate = (payload as { monthlyBasis?: unknown }).monthlyBasis;

  if (!candidate || typeof candidate !== 'object') {
    return {
      quarterAverageKrwPerL: null,
      monthRows: [],
    };
  }

  const monthRows = Array.isArray((candidate as { monthRows?: unknown }).monthRows)
    ? (candidate as { monthRows: Array<{ monthLabel?: unknown; priceKrwPerL?: unknown }> }).monthRows
        .filter((row) => typeof row.monthLabel === 'string' && typeof row.priceKrwPerL === 'string')
        .map((row) => ({
          monthLabel: row.monthLabel as string,
          priceKrwPerL: row.priceKrwPerL as string,
        }))
    : [];

  return {
    quarterAverageKrwPerL:
      typeof (candidate as { quarterAverageKrwPerL?: unknown }).quarterAverageKrwPerL === 'string'
        ? ((candidate as { quarterAverageKrwPerL?: string }).quarterAverageKrwPerL ?? null)
        : null,
    monthRows,
  };
}

function readPreviousWeekPrice(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = (payload as { previousWeekBasis?: unknown }).previousWeekBasis;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const priceKrwPerL = (candidate as { priceKrwPerL?: unknown }).priceKrwPerL;
  return typeof priceKrwPerL === 'string' ? priceKrwPerL : null;
}

function toQuarterSummary(value: {
  targetYear: number;
  targetQuarter: number;
  referenceYear: number;
  referenceQuarter: number;
  quarterStartDate: Date;
  quarterEndDate: Date;
  status: string;
  isActive: boolean;
}): FscDashboardQuarterSummary {
  return {
    targetYear: value.targetYear,
    targetQuarter: value.targetQuarter,
    referenceYear: value.referenceYear,
    referenceQuarter: value.referenceQuarter,
    quarterStartDate: value.quarterStartDate.toISOString(),
    quarterEndDate: value.quarterEndDate.toISOString(),
    status: value.status,
    isActive: value.isActive,
  };
}

function buildUnavailableDataSources(opinetFreshnessStatus: 'fresh' | 'delayed' | 'stale' | 'unavailable' = 'unavailable') {
  return buildDashboardDataSources({
    latestOpinetObservationDate: null,
    latestOpinetCollectedAt: null,
    latestDubaiObservationDate: null,
    latestDubaiCollectedAt: null,
    latestUsdKrwObservationDate: null,
    latestUsdKrwCollectedAt: null,
    opinetFreshnessStatus,
  });
}

function unavailableMarketSignals(reason: string): FscDashboardMarketSignalsSection {
  return {
    status: 'unavailable',
    summaryText: reason,
    signals: [],
    unavailableReason: reason,
  };
}

function buildSupportDataSources(support: FscDashboardSupportSection) {
  return buildDashboardDataSources({
    latestOpinetObservationDate: support.currentPrice.latestPriceDate,
    latestOpinetCollectedAt: support.currentPrice.sourceObservedAt,
    latestDubaiObservationDate:
      support.marketSignals.signals.find((signal) => signal.indicatorCode === 'dubai')?.latestObservationDate ?? null,
    latestDubaiCollectedAt:
      support.marketSignals.signals.find((signal) => signal.indicatorCode === 'dubai')?.collectedAt ?? null,
    latestUsdKrwObservationDate:
      support.marketSignals.signals.find((signal) => signal.indicatorCode === 'usd-krw')?.latestObservationDate ?? null,
    latestUsdKrwCollectedAt:
      support.marketSignals.signals.find((signal) => signal.indicatorCode === 'usd-krw')?.collectedAt ?? null,
    opinetFreshnessStatus:
      support.currentPrice.latestPriceDate === null
        ? 'unavailable'
        : calculateDataFreshness(support.currentPrice.latestPriceDate),
  });
}

async function loadPreviousForecastResult(input: {
  currentResultId: string;
  currentForecastRunId: string | null;
  currentCreatedAt: Date;
  targetYear: number;
  targetQuarter: number;
}) {
  if (input.currentForecastRunId === null) {
    return null;
  }

  return db.fscResult.findFirst({
    where: {
      targetYear: input.targetYear,
      targetQuarter: input.targetQuarter,
      scenarioName: 'base',
      id: {
        not: input.currentResultId,
      },
      createdAt: {
        lt: input.currentCreatedAt,
      },
      AND: [
        {
          forecastRunId: {
            not: null,
          },
        },
        {
          forecastRunId: {
            not: input.currentForecastRunId,
          },
        },
      ],
      weeks: {
        none: {
          forecastSourceKind: {
            in: ['monthly_point', 'carry_forward', 'applied_price_fallback', 'base_price_fallback'],
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      quarterAverageKrwPerL: true,
      weeks: {
        where: {
          priceKind: 'actual',
        },
        orderBy: {
          sequenceNo: 'asc',
        },
        select: {
          weekStartDate: true,
          weekEndDate: true,
        },
      },
    },
  });
}


async function loadSupportSection(): Promise<FscDashboardSupportSection> {
  const snapshot = await db.recomputeSnapshot.findFirst({
    where: {
      datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
      status: RunStatus.succeeded,
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      currentTruthCutoffAt: true,
    },
  });

  if (snapshot === null) {
    const unavailableCurrent: FscDashboardCurrentPriceSection = {
      availability: 'unavailable',
      latestPriceDate: null,
      latestPriceKrwPerL: null,
      previousPriceDate: null,
      previousPriceKrwPerL: null,
      absoluteChangeKrwPerL: null,
      percentChange: null,
      direction: 'flat',
      coverageStartDate: null,
      coverageEndDate: null,
      sourceObservedAt: null,
      unavailableReason: '전국 평균 오피넷 스냅샷이 아직 없습니다.',
    };

    const unavailableTrend: FscDashboardTrendSection = {
      availability: 'unavailable',
      points: [],
      latestWeeklyAverageKrwPerL: null,
      latestMonthlyAverageKrwPerL: null,
      unavailableReason: '추이 차트를 그릴 스냅샷 데이터가 아직 없습니다.',
    };

    return {
      currentPrice: unavailableCurrent,
      trend: unavailableTrend,
      marketSignals: unavailableMarketSignals('주요 시장 요인을 생성할 스냅샷 데이터가 아직 없습니다.'),
    };
  }

  const currentRows = await db.dailyPriceCurrent.findMany({
    where: {
      datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
      latestRecomputeSnapshotId: snapshot.id,
    },
    orderBy: {
      priceDate: 'asc',
    },
    include: {
      currentRevision: {
        select: {
          observedPriceKrwPerL: true,
          sourceObservedAt: true,
          sourcePayload: true,
        },
      },
    },
  });

  if (currentRows.length === 0) {
    return {
      currentPrice: {
        availability: 'unavailable',
        latestPriceDate: null,
        latestPriceKrwPerL: null,
        previousPriceDate: null,
        previousPriceKrwPerL: null,
        absoluteChangeKrwPerL: null,
        percentChange: null,
        direction: 'flat',
        coverageStartDate: null,
        coverageEndDate: null,
        sourceObservedAt: null,
        unavailableReason: '최신 스냅샷에 연결된 전국 평균 현재 가격이 없습니다.',
      },
      trend: {
        availability: 'unavailable',
        points: [],
        latestWeeklyAverageKrwPerL: null,
        latestMonthlyAverageKrwPerL: null,
        unavailableReason: '최근 추이를 그릴 일별 데이터가 아직 없습니다.',
      },
      marketSignals: unavailableMarketSignals('주요 시장 요인을 생성할 일별 가격 데이터가 아직 없습니다.'),
    };
  }

  const latestConfirmedDate = await loadPublicConfirmedLatestDate(db, {
    datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
    observedBeforeOrAt: snapshot.currentTruthCutoffAt,
  });
  const displayCurrentRows = selectDisplayCurrentRows(
    currentRows as DashboardCurrentRow[],
    latestConfirmedDate,
  );

  const seriesSnapshot = buildSeriesSnapshot({
    datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
    currentTruthCutoffAt: snapshot.currentTruthCutoffAt,
    dailyTruth: displayCurrentRows.map((row) => ({
      priceDate: row.priceDate,
      observedPriceKrwPerL: Number(row.currentRevision.observedPriceKrwPerL),
      datasetKey: row.datasetKey,
      currentRevisionId: row.currentRevisionId,
      latestRecomputeSnapshotId: row.latestRecomputeSnapshotId,
    })),
  });

  const latestRow = displayCurrentRows[displayCurrentRows.length - 1];
  const previousRow = displayCurrentRows[displayCurrentRows.length - 2] ?? null;
  const latestPriceKrwPerL = Number(latestRow.currentRevision.observedPriceKrwPerL);
  const previousPriceKrwPerL = previousRow ? Number(previousRow.currentRevision.observedPriceKrwPerL) : null;
  const absoluteChangeKrwPerL =
    previousPriceKrwPerL === null ? null : roundPrice(latestPriceKrwPerL - previousPriceKrwPerL);
  const percentChange =
    previousPriceKrwPerL === null || previousPriceKrwPerL === 0
      ? null
      : roundPrice((absoluteChangeKrwPerL! / previousPriceKrwPerL) * 100);

  const publicIndicatorCodes = ['dubai', 'usd-krw'] as const;
  const [indicatorRows, indicatorSyncStates] = await Promise.all([
    Promise.all(
      publicIndicatorCodes.map(async (indicatorCode) => ({
        indicatorCode,
        rows: await db.externalIndicatorHistory.findMany({
          where: { indicatorCode },
          orderBy: [{ observedAt: 'desc' }, { collectedAt: 'desc' }],
          take: 64,
          select: {
            observedAt: true,
            collectedAt: true,
            value: true,
            sourcePayload: true,
          },
        }),
      })),
    ),
    loadIndicatorSyncStates(publicIndicatorCodes),
  ]);

  const publicSignals = buildPublicMarketSignals(
    indicatorRows.map((entry) => ({
      indicatorCode: entry.indicatorCode,
      rows: entry.rows.map((row) => ({
        observedAt: row.observedAt,
        collectedAt: row.collectedAt,
        value: Number(row.value),
        sourcePayload: row.sourcePayload,
      })),
    })),
  );

  const hasCheckingSignal = publicSignals.some((signal) => signal.status === 'checking');
  const hasUnavailableSignal =
    publicSignals.length < publicIndicatorCodes.length ||
    publicSignals.some((signal) => signal.status === 'unavailable');
  const marketSignals: FscDashboardMarketSignalsSection = {
    status: hasUnavailableSignal ? 'insufficient_data' : hasCheckingSignal ? 'checking' : 'ready',
    summaryText: buildPublicMarketSummaryText(publicSignals),
    signals: publicSignals,
    unavailableReason: hasUnavailableSignal
      ? '두바이유와 USD/KRW의 최신 일별 유효 관측값 두 건이 모두 필요합니다.'
      : hasCheckingSignal
        ? '최신 데이터 확인 중'
        : undefined,
  };

  return {
    currentPrice: {
      availability: 'available',
      latestPriceDate: formatDate(latestRow.priceDate),
      latestPriceKrwPerL,
      previousPriceDate: previousRow ? formatDate(previousRow.priceDate) : null,
      previousPriceKrwPerL,
      absoluteChangeKrwPerL,
      percentChange,
      direction: deriveDirection(absoluteChangeKrwPerL),
      coverageStartDate: seriesSnapshot.coverageStartDate,
      coverageEndDate: seriesSnapshot.coverageEndDate,
      sourceObservedAt: formatTimestamp(latestRow.currentRevision.sourceObservedAt),
    },
    trend: {
      availability: seriesSnapshot.daily.points.length > 1 ? 'available' : 'unavailable',
      points: seriesSnapshot.daily.points.slice(-30).map((point) => ({
        date: point.priceDate,
        priceKrwPerL: point.observedPriceKrwPerL,
      })),
      latestWeeklyAverageKrwPerL: seriesSnapshot.latest.weekly?.averagePriceKrwPerL ?? null,
      latestMonthlyAverageKrwPerL: seriesSnapshot.latest.monthly?.averagePriceKrwPerL ?? null,
      unavailableReason:
        seriesSnapshot.daily.points.length > 1 ? undefined : '최근 추이를 그릴 수 있을 만큼의 일별 데이터가 없습니다.',
    },
    marketSignals,
  };
}

export interface FscDashboardQuarterSelection {
  targetYear: number;
  targetQuarter: number;
}

export async function loadFscDashboardData(
  selection?: FscDashboardQuarterSelection,
): Promise<FscDashboardData> {
  try {
    const activeQuarter = await ensureActiveQuarter();
    const quarterSettings = await db.quarterSetting.findMany({
      orderBy: [{ targetYear: 'desc' }, { targetQuarter: 'desc' }],
    });
    const selectedQuarter = resolveSelectedQuarter(quarterSettings, selection ?? null, activeQuarter);
    const isActiveQuarterSelected = selectedQuarter.id === activeQuarter.id;
    const availableQuarters = quarterSettings.map((candidate) => toQuarterSummary(candidate));
    const quarter = toQuarterSummary(selectedQuarter);
    const sharedSupport = await loadSupportSection();
    const support = isActiveQuarterSelected
      ? sharedSupport
      : {
          ...sharedSupport,
          currentPrice: await loadQuarterEndCurrentPrice(
            selectedQuarter.quarterStartDate,
            selectedQuarter.quarterEndDate,
          ),
        };
    const dataSources = buildSupportDataSources(support);
    const result = isActiveQuarterSelected
      ? await findLatestBaseFscResultByQuarter(selectedQuarter.targetYear, selectedQuarter.targetQuarter)
      : await findStoredBaseFscResultByQuarter(selectedQuarter.targetYear, selectedQuarter.targetQuarter);

    if (result === null) {
      return {
        state: 'empty',
        quarter,
        availableQuarters,
        isActiveQuarterSelected,
        support,
        dataSources,
      };
    }

    const fsc = serializeFscResultDto(result);
    const monthlyBasis = readMonthlyBasis(result.calculationPayload);
    const dataBasisAt = fsc.dataBasisAt;
    const previousForecastResult = await loadPreviousForecastResult({
      currentResultId: result.id,
      currentForecastRunId: result.forecastRunId,
      currentCreatedAt: result.createdAt,
      targetYear: result.targetYear,
      targetQuarter: result.targetQuarter,
    });
    const forecastChange = buildForecastChangeSummary({
      currentQuarterAverageKrwPerL: Number(result.quarterAverageKrwPerL),
      previousQuarterAverageKrwPerL:
        previousForecastResult === null ? null : Number(previousForecastResult.quarterAverageKrwPerL),
      currentActualWeeks: result.weeks.filter((week) => week.priceKind === 'actual'),
      previousActualWeeks: previousForecastResult?.weeks ?? [],
      marketSignals: support.marketSignals.signals,
    });

    return {
      state: 'available',
      quarter,
      availableQuarters,
      isActiveQuarterSelected,
      support,
      dataSources,
      fsc: {
        resultId: fsc.id,
        createdAt: fsc.createdAt,
        dataBasisAt,
        forecastCompletedAt: fsc.forecastCompletedAt,
        approvedAt: fsc.approvedAt,
        dataDelayMinutes: calculateDataDelayMinutes(dataBasisAt),
        timezone: 'Asia/Seoul',
        approvalStatus: fsc.approvalStatus,
        dataFreshnessStatus: calculateDataFreshness(dataBasisAt),
        reliabilityGrade: fsc.reliabilityGrade,
        basePriceKrwPerL: fsc.basePriceKrwPerL,
        appliedPriceKrwPerL: fsc.appliedPriceKrwPerL,
        quarterAverageKrwPerL: fsc.quarterAverageKrwPerL,
        priceDiffKrwPerL: fsc.priceDiffKrwPerL,
        diffRatio: fsc.diffRatio,
        fscLowRate: fsc.fscLowRate,
        fscHighRate: fsc.fscHighRate,
        fscLowKrwPerL: fsc.fscLowKrwPerL,
        fscHighKrwPerL: fsc.fscHighKrwPerL,
        actualWeekCount: fsc.actualWeekCount,
        forecastWeekCount: fsc.forecastWeekCount,
        reliabilitySampleCount: fsc.reliabilitySampleCount,
        reliabilityMinimumSampleCount: fsc.reliabilityMinimumSampleCount,
        recent13wWeeklyPriceMape: fsc.qualityMetrics.recent13wWeeklyPriceMape,
        recent26wWeeklyPriceMae: fsc.qualityMetrics.recent26wWeeklyPriceMae,
        recent4wErrorTrend: fsc.qualityMetrics.recent4wErrorTrend,
        previousWeekPriceKrwPerL: readPreviousWeekPrice(result.calculationPayload),
        weeks: fsc.weeks,
        referenceQuarterAverageKrwPerL: monthlyBasis?.quarterAverageKrwPerL ?? null,
        referenceMonthlyBasis: monthlyBasis?.monthRows ?? [],
        forecastChange,
      },
    };
  } catch (error) {
    return {
      state: 'unavailable',
      reason: 'active quarter FSC 대시보드를 불러오지 못했습니다.',
      detail: normalizeError(error),
      dataSources: buildUnavailableDataSources(),
    };
  }
}
