import { NextRequest, NextResponse } from 'next/server';
import { TERMS_OK_COOKIE } from '@/lib/legal';
import { googleConfig } from '@/lib/google-config';

export const runtime = 'nodejs';

// Redirects the user to Google's OAuth consent screen
export async function GET(req: NextRequest) {
  const cfg = googleConfig();
  if (!cfg.ok) return NextResponse.redirect(new URL(`/login?error=${cfg.error}`, req.url));
  const clientId = cfg.clientId;
  const redirectUri = `${cfg.appUrl}/api/auth/google/callback`;

  const redirect = req.nextUrl.searchParams.get('redirect') ?? '';
  const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    ...(safeRedirect ? { state: safeRedirect } : {}),
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  // Sign-up page sends agreed=1 only after the person ticks the Terms/Privacy box. The callback
  // refuses to create a new account without this short-lived cookie (existing users are unaffected).
  if (req.nextUrl.searchParams.get('agreed') === '1') {
    res.cookies.set(TERMS_OK_COOKIE, '1', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/google', maxAge: 600 });
  }
  return res;
}
