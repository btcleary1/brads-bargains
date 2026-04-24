import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, setSessionCookie } from '@/lib/session';
import { getUserById } from '@/lib/users';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getUserById(session.userId);
  const res = NextResponse.json({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    googleAuth: user?.googleAuth ?? false,
  });
  // Rolling session — refresh cookie on every auth check so active users never expire
  setSessionCookie(res, { userId: session.userId, email: session.email, name: session.name, role: session.role });
  return res;
}
