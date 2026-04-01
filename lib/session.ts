import { createHmac, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'health_session';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set.');
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8');
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
}

// Uses Node.js crypto — only call from nodejs runtime (API routes)
export function createSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + SESSION_TTL };
  const data = b64url(JSON.stringify(full));
  const sig = createHmac('sha256', getSecret()).update(data).digest('hex');
  return `${data}.${sig}`;
}

// Uses Web Crypto API — works in both Edge (middleware) and Node.js (API routes)
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return null;
    const data = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    if (!data || !sig) return null;

    const secret = getSecret();
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = new Uint8Array(sig.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const valid = await globalThis.crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
    if (!valid) return null;

    const payload: SessionPayload = JSON.parse(fromB64url(data));
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function setSessionCookie(res: NextResponse, payload: Omit<SessionPayload, 'iat' | 'exp'>): void {
  const token = createSessionToken(payload);
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
}
