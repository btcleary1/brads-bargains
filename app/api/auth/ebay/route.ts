import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.EBAY_CLIENT_ID;
  // Must be the RuName from eBay Developer portal, NOT the actual callback URL
  const ruName = process.env.EBAY_OAUTH_REDIRECT_URI;

  if (!clientId || !ruName) {
    return NextResponse.json({ error: 'eBay OAuth not configured' }, { status: 503 });
  }

  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/buy.order.readonly',
  ];

  // eBay OAuth requires %20-encoded spaces in scope, not + from URLSearchParams
  const authUrl =
    `https://auth.ebay.com/oauth2/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(ruName)}` +
    `&response_type=code` +
    `&scope=${scopes.map(encodeURIComponent).join('%20')}` +
    `&state=${encodeURIComponent(session.userId)}`;
  return NextResponse.redirect(authUrl);
}
