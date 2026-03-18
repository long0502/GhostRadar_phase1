'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_login: string | null;
}

export function AccountManager({
  admins,
  isSuperAdmin,
  currentUserId,
}: {
  admins: AdminUser[];
  isSuperAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        return;
      }
      setEmail('');
      setPassword('');
      setRole('admin');
      setShowForm(false);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, userEmail: string) {
    if (!confirm(`Delete account "${userEmail}"? This cannot be undone.`)) return;
    setDeletingId(id);

    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete');
        return;
      }
      router.refresh();
    } catch {
      alert('Network error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Account Management</h1>
        <p className="text-gray-400 mt-1">Admin user accounts</p>
      </div>

      {!isSuperAdmin && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-8 text-yellow-400 text-sm">
          ⚠️ Only superadmins can create or delete accounts.
        </div>
      )}

      {/* User Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Admin Users ({admins.length})</h2>
          {isSuperAdmin && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {showForm ? '✕ Cancel' : '+ New Admin'}
            </button>
          )}
        </div>

        {/* Create Form */}
        {showForm && isSuperAdmin && (
          <form onSubmit={handleCreate} className="bg-gray-800/50 border border-gray-700 rounded-lg p-5 mb-6">
            <h3 className="text-white font-semibold mb-4">Create New Admin</h3>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-4">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none"
                >
                  <option value="admin">admin</option>
                  <option value="superadmin">superadmin</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* Admin Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Role</th>
                <th className="text-left py-3 px-4">Created</th>
                <th className="text-left py-3 px-4">Last Login</th>
                {isSuperAdmin && <th className="text-right py-3 px-4">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-4 text-gray-200">
                    {a.email}
                    {a.id === currentUserId && (
                      <span className="ml-2 text-xs text-green-400">(you)</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        a.role === 'superadmin'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {a.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-400">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-gray-400">
                    {a.last_login ? new Date(a.last_login).toLocaleString() : 'Never'}
                  </td>
                  {isSuperAdmin && (
                    <td className="py-3 px-4 text-right">
                      {a.id !== currentUserId ? (
                        <button
                          onClick={() => handleDelete(a.id, a.email)}
                          disabled={deletingId === a.id}
                          className="text-red-400 hover:text-red-300 disabled:opacity-50 text-xs font-medium px-3 py-1 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors"
                        >
                          {deletingId === a.id ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
