import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserPrefs, saveUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const prefs = await getUserPrefs(session.userId);
  return NextResponse.json(prefs);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const current = await getUserPrefs(session.userId);
    const updated = { ...current, ...body };
    await saveUserPrefs(session.userId, updated);
    return NextResponse.json({ success: true, prefs: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
