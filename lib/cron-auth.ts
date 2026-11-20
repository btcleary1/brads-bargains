import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

// Who may run the scheduled jobs (scrape, cache warm, digest, watchlist, price check).
// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project,
// so no password ever has to sit in vercel.json (which is public on GitHub).
// GitHub Actions and manual runs can still pass ?secret=<DIGEST_SECRET>.

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isVercelCron(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) return false; // fail closed when unset
  return same(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

export function hasSecret(req: NextRequest, envName: string, param = 'secret'): boolean {
  const secret = (process.env[envName] ?? '').trim();
  if (!secret) return false; // fail closed when unset
  return same(req.nextUrl.searchParams.get(param) ?? '', secret);
}
