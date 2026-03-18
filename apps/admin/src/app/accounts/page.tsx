import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { AccountManager } from './AccountManager';

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

  // Serialize dates for client component
  const serializedAdmins = admins.map((a) => ({
    id: a.id,
    email: a.email,
    role: a.role,
    created_at: a.created_at.toISOString(),
    last_login: a.last_login?.toISOString() || null,
  }));

  return (
    <AccountManager
      admins={serializedAdmins}
      isSuperAdmin={isSuperAdmin}
      currentUserId={session?.id || ''}
    />
  );
}
