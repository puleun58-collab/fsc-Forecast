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

export function formatSourceCollectionDate(value: string | null): string {
  if (value === null) {
    return '확인 불가';
  }

  return formatDashboardDateTime(value);
}

export function buildDashboardDataSources(input: {
  latestOpinetObservationDate: string | null;
  latestOpinetCollectedAt: string | null;
  latestDubaiObservationDate: string | null;
  latestDubaiCollectedAt: string | null;
  latestUsdKrwObservationDate: string | null;
  latestUsdKrwCollectedAt: string | null;
  opinetFreshnessStatus?: 'fresh' | 'delayed' | 'stale' | 'unavailable';
}): DashboardDataSource[] {
  const opinetFreshnessStatus = input.opinetFreshnessStatus ?? calculateDataFreshness(input.latestOpinetObservationDate);

  return [
    {
      ...DASHBOARD_DATA_SOURCE_CONFIG.opinetDiesel,
      latestObservationDate: input.latestOpinetObservationDate,
      collectedAt: input.latestOpinetCollectedAt,
      observationGranularity: 'date',
      status:
        opinetFreshnessStatus === 'fresh'
          ? 'available'
          : opinetFreshnessStatus === 'unavailable'
            ? 'unavailable'
            : 'delayed',
    },
    {
      ...DASHBOARD_DATA_SOURCE_CONFIG.dubai,
      latestObservationDate: input.latestDubaiObservationDate,
      collectedAt: input.latestDubaiCollectedAt,
      observationGranularity: 'date',
      status: input.latestDubaiObservationDate === null ? 'unavailable' : 'available',
    },
    {
      ...DASHBOARD_DATA_SOURCE_CONFIG.usdKrw,
      latestObservationDate: input.latestUsdKrwObservationDate,
      collectedAt: input.latestUsdKrwCollectedAt,
      observationGranularity: 'date',
      status: input.latestUsdKrwObservationDate === null ? 'unavailable' : 'available',
    },
  ];
}
