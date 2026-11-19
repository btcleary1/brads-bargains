import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from '@/lib/session';

// Cleary suite security baseline: every page needs a login except this written public list.
// API routes are not matched here: each one checks the session (or its job secret) itself.
const PUBLIC_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/terms', '/privacy'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verifySessionToken(token))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?redirect=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!api/|_next/|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|txt|xml|webmanifest)).*)',
  ],
};
