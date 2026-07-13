import { DashboardShell } from '@/components/dashboard-shell';
import { loadFscDashboardData } from '@/lib/dashboard/load-fsc-dashboard-data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await loadFscDashboardData();

  return <DashboardShell data={data} />;
}
