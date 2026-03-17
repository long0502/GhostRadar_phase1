import { StatCard } from '@/components/StatCard';
import { getEventStats } from '@/lib/queries';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const stats = await getEventStats();

  const recentEvents = await prisma.events.findMany({
    orderBy: { created_at: 'desc' },
    take: 20,
    select: {
      id: true,
      event_type: true,
      event_data: true,
      has_detail: true,
      created_at: true,
      grid_id: true,
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Event Analytics</h1>
        <p className="text-gray-400 mt-1">Paranormal event database overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Events" value={stats.totalEvents} icon="👻" color="green" />
        <StatCard title="Expanded" value={stats.expandedEvents} icon="📖" color="purple" />
        <StatCard title="Expand Rate" value={`${stats.expandRate}%`} icon="📊" color="blue" />
        <StatCard title="Total Details" value={stats.totalDetails} icon="📋" color="yellow" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Recent Events</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Type</th>
                <th className="text-left py-3 px-4">Title</th>
                <th className="text-left py-3 px-4">Grid</th>
                <th className="text-center py-3 px-4">Detail</th>
                <th className="text-left py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e) => {
                const data = e.event_data as Record<string, unknown>;
                return (
                  <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 px-4">
                      <span className="bg-purple-500/10 text-purple-400 text-xs px-2 py-1 rounded">{e.event_type}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-200 max-w-xs truncate">{(data?.title as string) || '-'}</td>
                    <td className="py-3 px-4 font-mono text-xs text-green-400 truncate max-w-[150px]">{e.grid_id}</td>
                    <td className="py-3 px-4 text-center">
                      {e.has_detail ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
