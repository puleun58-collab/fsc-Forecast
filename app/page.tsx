import { DashboardShell } from '@/components/dashboard-shell';
import { loadFscDashboardData } from '@/lib/dashboard/load-fsc-dashboard-data';
import { parseQuarterSelection } from '@/lib/dashboard/quarter-selection';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const data = await loadFscDashboardData(parseQuarterSelection(searchParams) ?? undefined);

  return <DashboardShell data={data} />;
}
