import { RunStatus } from '@prisma/client';

import type {
  DashboardAvailableData,
  DashboardCommentarySection,
  DashboardCurrentStatus,
  DashboardData,
  DashboardExportItem,
  DashboardForecastPoint,
  DashboardSummaryValue,
  DashboardTrendDirection,
} from './types';

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTimestamp(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function deriveDirection(change: number | null): DashboardTrendDirection {
  if (change === null || change === 0) {
    return 'flat';
  }

  return change > 0 ? 'up' : 'down';
}

function createUnavailableData(reason: string, detail: string): DashboardData {
  return {
    availability: 'unavailable',
    marketScope: 'national-average',
    datasetKey: 'national-average-opinet-diesel',
    unavailable: {
      availability: 'unavailable',
      reason,
      detail,
    },
  };
}

function createSummaryValues(
  status: DashboardCurrentStatus,
  snapshotCompletedAt: string | null,
  currentRowCount: number,
): DashboardSummaryValue[] {
  const changeValue =
    status.absoluteChangeKrwPerL === null
      ? '직전 비교 불가'
      : `${status.absoluteChangeKrwPerL > 0 ? '+' : ''}${status.absoluteChangeKrwPerL.toFixed(1)}원/L`;
  const changeTone =
    status.direction === 'up'
      ? 'negative'
      : status.direction === 'down'
        ? 'positive'
        : 'muted';

  return [
    {
      label: '최신 전국 평균 경유가',
      value: `${status.latestPriceKrwPerL.toFixed(3)}원/L`,
    },
    {
      label: '직전 대비',
      value: changeValue,
      tone: changeTone,
    },
    {
      label: '스냅샷 기준 시각',
      value: snapshotCompletedAt ?? '기록 없음',
      tone: snapshotCompletedAt ? 'default' : 'muted',
    },
    {
      label: '현재 진실값 행 수',
      value: `${currentRowCount}일`,
    },
  ];
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '알 수 없는 오류가 발생했습니다.';
}

function getCommentaryUnavailableReason(status: DashboardCommentarySection['status']): string {
  switch (status) {
    case 'insufficient_data':
      return '해설 근거 지표가 아직 충분하지 않습니다.';
    case 'unavailable':
      return '해설 데이터를 불러오지 못했습니다.';
    case 'ready':
      return '';
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  try {
    const [
      { db },
      { buildSeriesSnapshot },
      { runCommentaryPipeline },
      { NATIONAL_AVERAGE_DATASET_KEY },
    ] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/aggregates/build-series-snapshot'),
      import('@/lib/commentary/run-commentary-pipeline'),
      import('@/lib/aggregates/types'),
    ]);

    const snapshot = await db.recomputeSnapshot.findFirst({
      where: {
        datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
        status: RunStatus.succeeded,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        datasetKey: true,
        createdAt: true,
        completedAt: true,
        currentTruthCutoffAt: true,
      },
    });

    if (!snapshot) {
      return createUnavailableData(
        '전국 평균 스냅샷이 아직 없습니다.',
        '성공한 recompute snapshot이 없어 현재 진실값, 예측, 해설, 내보내기 상태를 공개할 수 없습니다.',
      );
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
          },
        },
      },
    });

    if (currentRows.length === 0) {
      return createUnavailableData(
        '최신 스냅샷에 연결된 현재 진실값이 없습니다.',
        `recompute snapshot ${snapshot.id}에 연결된 daily_price_current 행이 없어 전국 평균 대시보드를 렌더링할 수 없습니다.`,
      );
    }

    const seriesSnapshot = buildSeriesSnapshot({
      datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
      currentTruthCutoffAt: snapshot.currentTruthCutoffAt,
      dailyTruth: currentRows.map((row) => ({
        priceDate: row.priceDate,
        observedPriceKrwPerL: Number(row.currentRevision.observedPriceKrwPerL),
        datasetKey: row.datasetKey,
        currentRevisionId: row.currentRevisionId,
        latestRecomputeSnapshotId: row.latestRecomputeSnapshotId,
      })),
    });

    const latestRow = currentRows[currentRows.length - 1];
    const previousRow = currentRows[currentRows.length - 2] ?? null;
    const latestPriceKrwPerL = Number(latestRow.currentRevision.observedPriceKrwPerL);
    const previousPriceKrwPerL = previousRow
      ? Number(previousRow.currentRevision.observedPriceKrwPerL)
      : null;
    const absoluteChangeKrwPerL =
      previousPriceKrwPerL === null ? null : roundPrice(latestPriceKrwPerL - previousPriceKrwPerL);
    const percentChange =
      previousPriceKrwPerL === null || previousPriceKrwPerL === 0
        ? null
        : roundPrice((absoluteChangeKrwPerL! / previousPriceKrwPerL) * 100);

    const status: DashboardCurrentStatus = {
      latestPriceDate: formatDate(latestRow.priceDate),
      latestPriceKrwPerL,
      previousPriceDate: previousRow ? formatDate(previousRow.priceDate) : null,
      previousPriceKrwPerL,
      absoluteChangeKrwPerL,
      percentChange,
      direction: deriveDirection(absoluteChangeKrwPerL),
      currentRevisionId: latestRow.currentRevisionId,
      sourceObservedAt: formatTimestamp(latestRow.currentRevision.sourceObservedAt),
      coverageStartDate: seriesSnapshot.coverageStartDate,
      coverageEndDate: seriesSnapshot.coverageEndDate,
    };

    const forecastRun = await db.forecastRun.findFirst({
      where: {
        recomputeSnapshotId: snapshot.id,
        status: RunStatus.succeeded,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        approvalState: true,
        completedAt: true,
        mapePct: true,
        maeKrwPerL: true,
        metadata: true,
        points: {
          orderBy: [{ horizonKind: 'asc' }, { horizonIndex: 'asc' }],
          select: {
            horizonKind: true,
            horizonIndex: true,
            targetDate: true,
            pointKrwPerL: true,
            lowerBoundKrwPerL: true,
            upperBoundKrwPerL: true,
          },
        },
      },
    });

    const forecastPoints: DashboardForecastPoint[] = (forecastRun?.points ?? []).map((point) => ({
      horizonKind: point.horizonKind,
      horizonIndex: point.horizonIndex,
      targetDate: formatDate(point.targetDate),
      pointKrwPerL: Number(point.pointKrwPerL),
      lowerBoundKrwPerL:
        point.lowerBoundKrwPerL === null ? null : Number(point.lowerBoundKrwPerL),
      upperBoundKrwPerL:
        point.upperBoundKrwPerL === null ? null : Number(point.upperBoundKrwPerL),
    }));

    let degradedReason: string | null = null;

    if (forecastRun?.metadata && typeof forecastRun.metadata === 'object' && !Array.isArray(forecastRun.metadata)) {
      const value = forecastRun.metadata as { degradedReason?: unknown };
      degradedReason = typeof value.degradedReason === 'string' ? value.degradedReason : null;
    }

    const forecast =
      forecastRun && forecastPoints.length > 0
        ? {
            availability: 'available' as const,
            approvalState: forecastRun.approvalState,
            degradedReason,
            generatedAt: formatTimestamp(forecastRun.completedAt),
            weeklyPoints: forecastPoints.filter((point) => point.horizonKind === 'weekly'),
            monthlyPoints: forecastPoints.filter((point) => point.horizonKind === 'monthly'),
            mapePct: forecastRun.mapePct === null ? null : Number(forecastRun.mapePct),
            maeKrwPerL: forecastRun.maeKrwPerL === null ? null : Number(forecastRun.maeKrwPerL),
          }
        : {
            availability: 'unavailable' as const,
            approvalState: null,
            degradedReason: null,
            generatedAt: null,
            weeklyPoints: [],
            monthlyPoints: [],
            mapePct: null,
            maeKrwPerL: null,
            unavailableReason: '최신 스냅샷에 연결된 성공한 예측 결과가 아직 없습니다.',
          };

    const indicatorCodes = ['dubai', 'brent', 'wti', 'usd-krw'] as const;

    const indicatorRows = await Promise.all(
      indicatorCodes.map(async (indicatorCode) => ({
        indicatorCode,
        rows: await db.externalIndicatorHistory.findMany({
          where: {
            indicatorCode,
            observedAt: snapshot.currentTruthCutoffAt
              ? {
                  lte: snapshot.currentTruthCutoffAt,
                }
              : undefined,
          },
          orderBy: {
            observedAt: 'desc',
          },
          take: 2,
        }),
      })),
    );

    const commentaryInput = indicatorRows.map((entry) => ({
      indicatorCode: entry.indicatorCode,
      points: [...entry.rows]
        .reverse()
        .map((row) => ({ observedAt: row.observedAt, value: Number(row.value) })),
    }));

    const commentaryResult = runCommentaryPipeline({
      recomputeSnapshotId: snapshot.id,
      latestPrice: {
        observedAt: latestRow.priceDate,
        priceKrwPerL: latestPriceKrwPerL,
      },
      previousPrice: previousRow
        ? {
            observedAt: previousRow.priceDate,
            priceKrwPerL: previousPriceKrwPerL!,
          }
        : null,
      indicators: commentaryInput,
    });

    const commentary: DashboardCommentarySection = {
      status: commentaryResult.status,
      generatedAt: commentaryResult.generatedAt.toISOString(),
      text: commentaryResult.commentaryText,
      signals: commentaryResult.signals.map((signal) => ({
        indicatorCode: signal.indicatorCode,
        reasonText: signal.reasonText,
      })),
      unavailableReason: getCommentaryUnavailableReason(commentaryResult.status) || undefined,
    };

    const exportRuns = await db.exportRun.findMany({
      where: {
        recomputeSnapshotId: snapshot.id,
        status: RunStatus.succeeded,
        exportFormat: {
          in: ['csv', 'xlsx'],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        exportFormat: true,
        completedAt: true,
        storageKey: true,
      },
    });

    const exportItems: DashboardExportItem[] = ['csv', 'xlsx'].map((format) => {
      const run = exportRuns.find((item) => item.exportFormat.toLowerCase() === format);

      return {
        format: format as 'csv' | 'xlsx',
        availability: 'available',
        completedAt: run ? formatTimestamp(run.completedAt) : null,
        storageKey: run?.storageKey ?? null,
        unavailableReason: run
          ? undefined
          : '실행 이력은 아직 없지만 최신 성공 스냅샷 기준 다운로드는 즉시 생성할 수 있습니다.',
      };
    });

    const data: DashboardAvailableData = {
      availability: 'available',
      marketScope: 'national-average',
      datasetKey: snapshot.datasetKey,
      snapshot: {
        snapshotId: snapshot.id,
        createdAt: snapshot.createdAt.toISOString(),
        completedAt: formatTimestamp(snapshot.completedAt),
        currentTruthCutoffAt: formatTimestamp(snapshot.currentTruthCutoffAt),
        currentRowCount: currentRows.length,
      },
      status,
      summaryValues: createSummaryValues(status, formatTimestamp(snapshot.completedAt), currentRows.length),
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
      forecast,
      commentary,
      exports: {
        snapshotId: snapshot.id,
        items: exportItems,
      },
    };

    return data;
  } catch (error) {
    return createUnavailableData(
      '전국 평균 대시보드 데이터를 불러오지 못했습니다.',
      normalizeError(error),
    );
  }
}
