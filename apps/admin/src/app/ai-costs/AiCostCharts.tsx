'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DailyData {
  day: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  errorCount: number;
}

export function AiCostCharts({ dailyCosts }: { dailyCosts: DailyData[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Daily Cost Trend */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Daily AI Cost (30 days)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyCosts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="day" stroke="#6b7280" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cost']}
            />
            <Bar dataKey="totalCost" fill="#eab308" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Token Usage */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Daily Token Consumption (30 days)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyCosts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="day" stroke="#6b7280" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Legend />
            <Bar dataKey="inputTokens" fill="#22c55e" name="Input" stackId="tokens" radius={[0, 0, 0, 0]} />
            <Bar dataKey="outputTokens" fill="#3b82f6" name="Output" stackId="tokens" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
