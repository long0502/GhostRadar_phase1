import { StatCard } from '@/components/StatCard';
import { getDashboardStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard Overview</h1>
        <p className="text-gray-400 mt-1">Real-time analytics for Ghost Radar</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Scans Today"
          value={stats.scansToday}
          icon="📡"
          color="green"
          subtitle="Total radar scans"
        />
        <StatCard
          title="AI Cost Today"
          value={`$${Number(stats.aiCostToday).toFixed(4)}`}
          icon="💰"
          color="yellow"
          subtitle="Estimated USD"
        />
        <StatCard
          title="AI Calls Today"
          value={stats.totalAiCalls}
          icon="🤖"
          color="blue"
          subtitle="Gemini API calls"
        />
        <StatCard
          title="Expands Today"
          value={stats.expandsToday}
          icon="📖"
          color="purple"
          subtitle={`${stats.expandRate}% expand rate`}
        />
        <StatCard
          title="Total Events"
          value={stats.totalEvents}
          icon="👻"
          color="green"
          subtitle="In database"
        />
        <StatCard
          title="Cache Performance"
          value={`${Number(stats.cacheHitRatio).toFixed(0)}`}
          icon="⚡"
          color="blue"
          subtitle="Avg events from cache"
        />
      </div>
    </div>
  );
}
