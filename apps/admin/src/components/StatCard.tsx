interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'green' | 'blue' | 'red' | 'yellow' | 'purple';
}

const colorMap = {
  green: 'from-green-500/10 to-green-600/5 border-green-500/20 text-green-400',
  blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-400',
  red: 'from-red-500/10 to-red-600/5 border-red-500/20 text-red-400',
  yellow: 'from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 text-yellow-400',
  purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20 text-purple-400',
};

export function StatCard({ title, value, subtitle, icon, color = 'green' }: StatCardProps) {
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5 relative overflow-hidden`}>
      <div className="absolute top-3 right-3 text-3xl opacity-30">{icon}</div>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <p className={`text-3xl font-bold ${colorMap[color].split(' ').pop()}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
    </div>
  );
}
