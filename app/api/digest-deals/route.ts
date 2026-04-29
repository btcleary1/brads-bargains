import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { r2Get } from '@/lib/r2';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await r2Get<{ generatedAt: string; aiPick: string | null; items: object[] }>(
    `deal-wiz/digest-user-${session.userId}.json`
  );
  if (!data) return NextResponse.json({ items: [], generatedAt: null, aiPick: null });

  return NextResponse.json(data);
}
