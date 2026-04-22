import { NextRequest, NextResponse } from 'next/server';
import { getUserPrefs, saveUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code || !userId) {
    return NextResponse.redirect(new URL('/settings?ebay=error', req.url));
  }

  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const redirectUri = process.env.EBAY_OAUTH_REDIRECT_URI!; // must be the RuName, not the callback URL

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[ebay oauth] token exchange failed:', text);
      const reason = encodeURIComponent(text.slice(0, 120));
      return NextResponse.redirect(new URL(`/settings?ebay=error&reason=${reason}`, req.url));
    }

    const tokenData = await tokenRes.json();
    const prefs = await getUserPrefs(userId);
    await saveUserPrefs(userId, {
      ...prefs,
      ebayAccessToken: tokenData.access_token,
      ebayRefreshToken: tokenData.refresh_token,
      ebayTokenExpiresAt: Date.now() + tokenData.expires_in * 1000,
    });

    return NextResponse.redirect(new URL('/settings?ebay=connected', req.url));
  } catch (err) {
    console.error('[ebay oauth] callback error:', err);
    return NextResponse.redirect(new URL('/settings?ebay=error', req.url));
  }
}
