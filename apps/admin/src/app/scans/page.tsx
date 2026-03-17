import { StatCard } from '@/components/StatCard';
import { getScanDaily, getTopLocations } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ScansPage() {
  const [dailyScans, topLocations] = await Promise.all([
    getScanDaily(30),
    getTopLocations(10),
  ]);

  const totalScans = dailyScans.reduce((s, d) => s + d.scanCount, 0);
  const totalExpands = dailyScans.reduce((s, d) => s + d.expandCount, 0);
  const totalCacheHits = dailyScans.reduce((s, d) => s + d.cacheHits, 0);
  const avgResponse = dailyScans.length > 0
    ? Math.round(dailyScans.reduce((s, d) => s + d.avgResponse, 0) / dailyScans.length)
    : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Scan Analytics</h1>
        <p className="text-gray-400 mt-1">Radar scan activity and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Scans (30d)" value={totalScans} icon="📡" color="green" />
        <StatCard title="Total Expands (30d)" value={totalExpands} icon="📖" color="purple" />
        <StatCard title="Cache Hits (30d)" value={totalCacheHits} icon="⚡" color="blue" />
        <StatCard title="Avg Response" value={`${avgResponse}ms`} icon="⏱️" color="yellow" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Scan Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Daily Activity (30 days)</h2>
          <div className="overflow-y-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-right py-3 px-4">Scans</th>
                  <th className="text-right py-3 px-4">Expands</th>
                  <th className="text-right py-3 px-4">Cache</th>
                  <th className="text-right py-3 px-4">Avg ms</th>
                </tr>
              </thead>
              <tbody>
                {[...dailyScans].reverse().map((d) => (
                  <tr key={d.day} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-4 text-gray-300">{d.day}</td>
                    <td className="py-2 px-4 text-right text-green-400">{d.scanCount}</td>
                    <td className="py-2 px-4 text-right text-purple-400">{d.expandCount}</td>
                    <td className="py-2 px-4 text-right text-blue-400">{d.cacheHits}</td>
                    <td className="py-2 px-4 text-right text-gray-400">{d.avgResponse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Locations */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Top Scanned Locations</h2>
          <div className="space-y-3">
            {topLocations.map((loc, i) => (
              <div key={loc.gridId} className="flex items-center gap-3">
                <span className="text-gray-500 text-sm w-6">{i + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-green-400 truncate max-w-[200px]">{loc.gridId}</span>
                    <span className="text-sm text-gray-300">{loc.scanCount} scans</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full"
                      style={{ width: `${Math.min(100, (loc.scanCount / (topLocations[0]?.scanCount || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {topLocations.length === 0 && <p className="text-gray-500 text-sm">No scan data yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
