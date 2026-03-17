import { StatCard } from '@/components/StatCard';
import { getAiCostDaily, getAiCostByModel, getAiCostByEndpoint, getAiErrors } from '@/lib/queries';
import { AiCostCharts } from './AiCostCharts';

export const dynamic = 'force-dynamic';

export default async function AiCostsPage() {
  const [dailyCosts, byModel, byEndpoint, errors] = await Promise.all([
    getAiCostDaily(30),
    getAiCostByModel(7),
    getAiCostByEndpoint(7),
    getAiErrors(20),
  ]);

  // Calculate summary KPIs
  const todayData = dailyCosts[dailyCosts.length - 1];
  const totalCost7d = dailyCosts.slice(-7).reduce((s, d) => s + d.totalCost, 0);
  const totalTokens7d = dailyCosts.slice(-7).reduce((s, d) => s + d.inputTokens + d.outputTokens, 0);
  const totalCalls7d = dailyCosts.slice(-7).reduce((s, d) => s + d.callCount, 0);
  const totalErrors7d = dailyCosts.slice(-7).reduce((s, d) => s + d.errorCount, 0);
  const errorRate = totalCalls7d > 0 ? ((totalErrors7d / totalCalls7d) * 100).toFixed(1) : '0';

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">AI Call & Token Analytics</h1>
        <p className="text-gray-400 mt-1">Gemini API usage, cost tracking, and token consumption</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard title="Cost Today" value={`$${(todayData?.totalCost || 0).toFixed(4)}`} icon="💰" color="yellow" />
        <StatCard title="Calls Today" value={todayData?.callCount || 0} icon="📞" color="blue" />
        <StatCard title="Tokens Today" value={((todayData?.inputTokens || 0) + (todayData?.outputTokens || 0)).toLocaleString()} icon="🔤" color="green" />
        <StatCard title="Cost (7d)" value={`$${totalCost7d.toFixed(4)}`} icon="📊" color="yellow" />
        <StatCard title="Total Calls (7d)" value={totalCalls7d.toLocaleString()} icon="🤖" color="purple" />
        <StatCard title="Error Rate (7d)" value={`${errorRate}%`} icon="⚠️" color="red" />
      </div>

      {/* Charts */}
      <AiCostCharts dailyCosts={dailyCosts} />

      {/* By Model Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Token Consumption by Model (7 days)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Model</th>
                <th className="text-right py-3 px-4">Input Tokens</th>
                <th className="text-right py-3 px-4">Output Tokens</th>
                <th className="text-right py-3 px-4">Total Tokens</th>
                <th className="text-right py-3 px-4">Cost</th>
                <th className="text-right py-3 px-4">Calls</th>
                <th className="text-right py-3 px-4">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((m) => (
                <tr key={m.model} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-mono text-green-400">{m.model}</td>
                  <td className="py-3 px-4 text-right">{m.inputTokens.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">{m.outputTokens.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right font-bold">{(m.inputTokens + m.outputTokens).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-yellow-400">${m.totalCost.toFixed(4)}</td>
                  <td className="py-3 px-4 text-right">{m.callCount}</td>
                  <td className="py-3 px-4 text-right text-gray-400">{m.avgLatency}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Endpoint Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Usage by Endpoint (7 days)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Endpoint</th>
                <th className="text-right py-3 px-4">Calls</th>
                <th className="text-right py-3 px-4">Total Tokens</th>
                <th className="text-right py-3 px-4">Cost</th>
                <th className="text-right py-3 px-4">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {byEndpoint.map((e) => (
                <tr key={e.endpoint} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-mono text-blue-400">{e.endpoint}</td>
                  <td className="py-3 px-4 text-right">{e.callCount}</td>
                  <td className="py-3 px-4 text-right">{e.totalTokens.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-yellow-400">${e.totalCost.toFixed(4)}</td>
                  <td className="py-3 px-4 text-right text-gray-400">{e.avgLatency}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Recent Errors</h2>
        {errors.length === 0 ? (
          <p className="text-gray-500 text-sm">No errors recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-4">Time</th>
                  <th className="text-left py-3 px-4">Endpoint</th>
                  <th className="text-left py-3 px-4">Model</th>
                  <th className="text-left py-3 px-4">Error</th>
                  <th className="text-right py-3 px-4">Latency</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-red-900/10">
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-blue-400">{e.endpoint}</td>
                    <td className="py-3 px-4 font-mono text-green-400 text-xs">{e.model}</td>
                    <td className="py-3 px-4 text-red-400 max-w-xs truncate">{e.error_message || '-'}</td>
                    <td className="py-3 px-4 text-right">{e.latency_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
