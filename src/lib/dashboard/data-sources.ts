import { DASHBOARD_DATA_SOURCE_CONFIG } from './data-source-config';
import {
  calculateDataFreshness,
  formatDashboardDate,
  formatDashboardDateTime,
  formatDashboardMonth,
} from './dashboard-time';
import type { DashboardDataSource } from './fsc-types';

export function formatSourceObservation(
  value: string | null,
  granularity: 'datetime' | 'date' | 'month',
): string {
  if (value === null) {
    return '확인 불가';
  }

  if (granularity === 'datetime') {
    return formatDashboardDateTime(value);
  }

  if (granularity === 'month') {
    return `${formatDashboardMonth(value)} 기준`;
  }

  return formatDashboardDate(value);
}

export function buildDashboardDataSources(input: {
  latestOpinetObservedAt: string | null;
  latestDubaiObservedAt: string | null;
  latestUsdKrwObservedAt: string | null;
  opinetFreshnessStatus?: 'fresh' | 'delayed' | 'stale' | 'unavailable';
}): DashboardDataSource[] {
  const opinetFreshnessStatus = input.opinetFreshnessStatus ?? calculateDataFreshness(input.latestOpinetObservedAt);

  return [
    {
      ...DASHBOARD_DATA_SOURCE_CONFIG.opinetDiesel,
      latestObservedAt: input.latestOpinetObservedAt,
      observationGranularity: 'datetime',
      status:
        opinetFreshnessStatus === 'fresh'
          ? 'available'
          : opinetFreshnessStatus === 'unavailable'
            ? 'unavailable'
            : 'delayed',
    },
    {
      ...DASHBOARD_DATA_SOURCE_CONFIG.dubai,
      latestObservedAt: input.latestDubaiObservedAt,
      observationGranularity: 'month',
      status: input.latestDubaiObservedAt === null ? 'unavailable' : 'available',
    },
    {
      ...DASHBOARD_DATA_SOURCE_CONFIG.usdKrw,
      latestObservedAt: input.latestUsdKrwObservedAt,
      observationGranularity: 'date',
      status: input.latestUsdKrwObservedAt === null ? 'unavailable' : 'available',
    },
  ];
}
