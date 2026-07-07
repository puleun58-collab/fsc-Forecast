import { DashboardShell } from '@/components/dashboard-shell';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await loadDashboardData();

  return <DashboardShell data={data} />;
}
