import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prefs = await getUserPrefs(session.userId) as any;
  const connected = !!(prefs.ebayAccessToken && prefs.ebayTokenExpiresAt && prefs.ebayTokenExpiresAt > Date.now());
  return NextResponse.json({ connected });
}
