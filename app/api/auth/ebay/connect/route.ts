import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { buildOAuthState, getEbayUserAuthUrl } from '@/lib/ebay-user';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const redirectUri = process.env.EBAY_OAUTH_REDIRECT_URI
    ?? process.env.EBAY_REDIRECT_URI
    ?? `${req.nextUrl.protocol}//${req.nextUrl.host}/api/auth/ebay/callback`;

  const state = buildOAuthState(session.userId);
  const authUrl = getEbayUserAuthUrl(redirectUri, state);

  console.log('[ebay-connect] redirectUri:', redirectUri);
  console.log('[ebay-connect] authUrl:', authUrl.slice(0, 200));

  return NextResponse.redirect(authUrl);
}
