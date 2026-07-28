import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers } from '@/lib/users';
import { getUserPrefs } from '@/lib/tracker-data';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await getAllUsers();
  const withPrefs = await Promise.all(users.map(async u => {
    const prefs = await getUserPrefs(u.userId).catch(() => ({} as any));
    return {
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
      loginCount: u.loginCount ?? 0,
      googleAuth: u.googleAuth ?? false,
      notificationEmail: prefs.notificationEmail ?? null,
    };
  }));

  return NextResponse.json({ count: withPrefs.length, users: withPrefs });
}
