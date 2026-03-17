import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await getSession();
  const isSuperAdmin = session?.role === 'superadmin';

  const admins = await prisma.admin_users.findMany({
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      created_at: true,
      last_login: true,
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Account Management</h1>
        <p className="text-gray-400 mt-1">Admin user accounts</p>
      </div>

      {!isSuperAdmin && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-8 text-yellow-400 text-sm">
          ⚠️ Only superadmins can create or delete accounts.
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Admin Users ({admins.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Role</th>
                <th className="text-left py-3 px-4">Created</th>
                <th className="text-left py-3 px-4">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-4 text-gray-200">{a.email}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded ${
                      a.role === 'superadmin' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {a.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-gray-400">
                    {a.last_login ? new Date(a.last_login).toLocaleString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
