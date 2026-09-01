import { db } from '@/lib/db';
import { loadIndicatorSyncStates } from '@/lib/external-indicators/indicator-sync-state';
import { loadLatestIndicatorStates } from '@/lib/external-indicators/latest-indicator-states';
import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';
import { readWeeklySeries } from '@/lib/opinet/save-weekly-series';

import {
  buildDataHealthItem,
  getLatestObservation,
  summarizeDataHealth,
  type DataCollectionState,
  type DataHealthItem,
  type DataHealthSummary,
} from './data-health';

const EXTERNAL_CODES = ['dubai', 'usd-krw'] as const;

function formatWeeklyDataLabel(
  weekStartDate: Date | string,
  weekEndDate: Date | string,
  fallback: string,
): string {
  try {
    const displayWeek = getOpinetDisplayWeek(weekStartDate, weekEndDate);
    return `${displayWeek.month}월 ${displayWeek.weekOfMonth}주차`;
  } catch {
    return fallback;
  }
}

export async function loadAdminDataHealth(now = new Date()): Promise<DataHealthSummary> {
  const weeklyCachePromise = readWeeklySeries()
    .then((rows) => ({ rows, failed: false }))
    .catch(() => ({ rows: [], failed: true }));
  const [
    latestDaily,
    latestIngest,
    latestSuccessfulIngest,
    latestOfficialWeek,
    weeklyCache,
    indicatorSyncStates,
    latestIndicatorStates,
  ] = await Promise.all([
    db.dailyPriceCurrent.findFirst({
      orderBy: [{ priceDate: 'desc' }, { updatedAt: 'desc' }],
      select: {
        priceDate: true,
        currentRevision: {
          select: { createdAt: true },
        },
      },
    }),
    db.ingestRun.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        status: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    db.ingestRun.findFirst({
      where: { status: 'succeeded' },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        completedAt: true,
        createdAt: true,
      },
    }),
    db.fscQuarterWeek.findFirst({
      where: {
        priceKind: 'actual',
        officialWeekLabel: { not: null },
      },
      orderBy: [{ weekEndDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        weekStartDate: true,
        weekEndDate: true,
        officialWeekLabel: true,
        createdAt: true,
      },
    }),
    weeklyCachePromise,
    loadIndicatorSyncStates(EXTERNAL_CODES),
    loadLatestIndicatorStates({ indicatorCodes: EXTERNAL_CODES }),
  ]);

  const latestCachedWeek = weeklyCache.rows.at(-1) ?? null;
  const weeklyDataAt = latestOfficialWeek?.weekEndDate ?? latestCachedWeek?.weekEndDate ?? null;
  const weeklyCollectedAt = latestOfficialWeek?.createdAt ?? latestCachedWeek?.fetchedAt ?? null;
  const weeklyLabel = latestOfficialWeek
    ? formatWeeklyDataLabel(
        latestOfficialWeek.weekStartDate,
        latestOfficialWeek.weekEndDate,
        latestOfficialWeek.officialWeekLabel ?? '주차 확인 불가',
      )
    : latestCachedWeek
      ? formatWeeklyDataLabel(
          latestCachedWeek.weekStartDate,
          latestCachedWeek.weekEndDate,
          latestCachedWeek.weekLabel,
        )
      : null;
  const latestDailyRunFailed = latestIngest?.status === 'failed';
  const items: DataHealthItem[] = [
    buildDataHealthItem({
      sourceCode: 'opinet-daily',
      source: '오피넷 일별 경유가',
      latestDataAt: latestDaily?.priceDate ?? null,
      lastCollectedAt:
        latestSuccessfulIngest?.completedAt ??
        latestSuccessfulIngest?.createdAt ??
        latestDaily?.currentRevision.createdAt ??
        null,
      collectionState: latestDailyRunFailed
        ? 'failed'
        : latestSuccessfulIngest === null
          ? null
          : 'succeeded',
      errorAt: latestDailyRunFailed
        ? latestIngest.completedAt ?? latestIngest.createdAt
        : null,
      errorMessage: latestDailyRunFailed ? '오피넷 일별 경유가 데이터 수집 요청 실패' : null,
      now,
    }),
    buildDataHealthItem({
      sourceCode: 'opinet-weekly',
      source: '오피넷 주간 경유가',
      latestDataAt: weeklyDataAt,
      latestDataLabel: weeklyLabel,
      lastCollectedAt: weeklyCollectedAt,
      collectionState:
        weeklyDataAt !== null
          ? 'succeeded'
          : weeklyCache.failed
            ? 'failed'
            : null,
      errorMessage: weeklyCache.failed ? '오피넷 주간 경유가 데이터 확인 실패' : null,
      now,
    }),
  ];

  for (const indicatorCode of EXTERNAL_CODES) {
    const syncState = indicatorSyncStates.find((state) => state.indicatorCode === indicatorCode) ?? null;
    const latestState = latestIndicatorStates.find((state) => state.indicatorCode === indicatorCode) ?? null;
    const source = indicatorCode === 'dubai' ? 'Dubai' : 'USD/KRW';
    const collectionState: DataCollectionState = syncState?.status ?? null;

    items.push(
      buildDataHealthItem({
        sourceCode: indicatorCode,
        source,
        latestDataAt: getLatestObservation([
          syncState?.latestObservedAt ?? null,
          latestState?.observedAt ?? null,
        ]),
        lastCollectedAt: syncState?.lastSuccessAt ?? latestState?.collectedAt ?? null,
        collectionState,
        errorAt: collectionState === 'failed' ? syncState?.lastAttemptAt ?? null : null,
        errorMessage: collectionState === 'failed' ? `${source} 데이터 수집 요청 실패` : null,
        now,
      }),
    );
  }

  return summarizeDataHealth(items);
}
