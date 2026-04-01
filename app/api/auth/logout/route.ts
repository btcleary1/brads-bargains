import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  // Also clear legacy cookie
  res.cookies.set('app_auth', '', { maxAge: 0, path: '/' });
  return res;
}
