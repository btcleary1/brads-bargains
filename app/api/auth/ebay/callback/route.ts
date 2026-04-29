import { NextRequest, NextResponse } from 'next/server';
import { verifyOAuthState, exchangeEbayCode } from '@/lib/ebay-user';
import { saveEbayUserTokens } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const settingsUrl = new URL('/settings', req.nextUrl.origin);

  if (error || !code || !state) {
    settingsUrl.searchParams.set('ebay', 'denied');
    return NextResponse.redirect(settingsUrl);
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    settingsUrl.searchParams.set('ebay', 'invalid');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const redirectUri = process.env.EBAY_REDIRECT_URI
      ?? `${req.nextUrl.protocol}//${req.nextUrl.host}/api/auth/ebay/callback`;

    const tokens = await exchangeEbayCode(code, redirectUri);
    await saveEbayUserTokens(userId, tokens);

    settingsUrl.searchParams.set('ebay', 'connected');
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error('eBay callback error:', err);
    settingsUrl.searchParams.set('ebay', 'error');
    return NextResponse.redirect(settingsUrl);
  }
}
