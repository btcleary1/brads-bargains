import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getEbayUserTokens } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tokens = await getEbayUserTokens(session.userId);
  if (!tokens) return NextResponse.json({ connected: false });

  // Check if refresh token is still valid (eBay refresh tokens last ~547 days)
  if (Date.now() > tokens.refreshExpiresAt) {
    return NextResponse.json({ connected: false, expired: true });
  }

  return NextResponse.json({ connected: true });
}
