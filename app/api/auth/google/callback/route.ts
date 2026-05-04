import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createUser, userCount, markGoogleAuth, incrementLoginCount } from '@/lib/users';
import { setSessionCookie } from '@/lib/session';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; id_token: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${APP_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  return res.json();
}

async function getGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string; sub: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google user info');
  return res.json();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const state = req.nextUrl.searchParams.get('state') ?? '';
  const safeRedirect = state.startsWith('/') && !state.startsWith('//') ? state : '';

  if (error || !code) {
    return NextResponse.redirect(`${APP_URL}/login?error=google_cancelled`);
  }

  try {
    const { access_token } = await exchangeCodeForTokens(code);
    const googleUser = await getGoogleUserInfo(access_token);

    const ip = getClientIp(req);
    let user = await getUserByEmail(googleUser.email);

    if (!user) {
      // New user — create account automatically (no password needed)
      const count = await userCount();
      const role = count === 0 ? 'admin' : 'user';
      // Use a random placeholder password — they'll never use it (Google auth only)
      const { randomBytes } = await import('crypto');
      const placeholderPassword = randomBytes(32).toString('hex');
      user = await createUser(googleUser.email, googleUser.name || googleUser.email.split('@')[0], placeholderPassword, role);
      logAudit({ timestamp: new Date().toISOString(), userId: user.userId, email: user.email, action: 'register', ip, details: 'google_oauth' });
    } else {
      logAudit({ timestamp: new Date().toISOString(), userId: user.userId, email: user.email, action: 'login_success', ip, details: 'google_oauth' });
    }
    // Track login for both new and returning Google users
    await incrementLoginCount(user.userId);

    // Stamp googleAuth flag so settings page can hide password section
    await markGoogleAuth(user.userId);

    const safeName = user.name.replace(/[^\u0000-\u00FF]/g, '').trim() || user.email;
    const loginDest = safeRedirect
      ? `${APP_URL}/login?setup-passkey=1&redirect=${encodeURIComponent(safeRedirect)}`
      : `${APP_URL}/login?setup-passkey=1`;
    const res = NextResponse.redirect(loginDest);
    setSessionCookie(res, {
      userId: user.userId,
      email: user.email,
      name: safeName,
      role: user.role,
    });
    return res;
  } catch (err) {
    console.error('Google OAuth error:', err);
    return NextResponse.redirect(`${APP_URL}/login?error=google_failed`);
  }
}
