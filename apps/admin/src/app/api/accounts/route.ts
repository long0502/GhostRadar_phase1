import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, password, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (role && !['admin', 'superadmin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const existing = await prisma.admin_users.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const password_hash = await hashPassword(password);
    const user = await prisma.admin_users.create({
      data: { email, password_hash, role: role || 'admin' },
      select: { id: true, email: true, role: true, created_at: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('[Create Admin Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
