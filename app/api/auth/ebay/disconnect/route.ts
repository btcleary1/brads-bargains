import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { deleteEbayUserTokens } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await deleteEbayUserTokens(session.userId);
  return NextResponse.json({ success: true });
}
