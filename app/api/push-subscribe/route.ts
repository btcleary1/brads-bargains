import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserPrefs, saveUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { subscription } = body;

  const prefs = await getUserPrefs(session.userId);
  const existing: object[] = (prefs.pushSubscriptions as object[] | undefined) ?? [];

  // Avoid duplicate endpoints
  const endpoint = subscription?.endpoint;
  const updated = endpoint
    ? [...existing.filter((s: any) => s.endpoint !== endpoint), subscription]
    : existing;

  await saveUserPrefs(session.userId, { ...prefs, pushSubscriptions: updated });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await req.json();
  const prefs = await getUserPrefs(session.userId);
  const existing: object[] = (prefs.pushSubscriptions as object[] | undefined) ?? [];
  await saveUserPrefs(session.userId, { ...prefs, pushSubscriptions: existing.filter((s: any) => s.endpoint !== endpoint) });
  return NextResponse.json({ success: true });
}
