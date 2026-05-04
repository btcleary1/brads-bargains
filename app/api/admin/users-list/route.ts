import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers } from '@/lib/users';
import { getUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

const SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
