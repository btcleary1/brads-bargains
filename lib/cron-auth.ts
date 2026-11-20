import { createPublicKey, timingSafeEqual, verify, type JsonWebKey } from 'crypto';
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

// GitHub Actions proves who it is with a short-lived token signed by GitHub (OIDC), so the
// workflows need no shared password that has to match between GitHub and Vercel.
const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_AUDIENCE = 'cleary-etrading-jobs';
const GITHUB_REPO = 'btcleary1/brads-bargains';

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: Jwk[]; at: number } | null = null;

async function githubKeys(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`GitHub JWKS returned ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys, at: Date.now() };
  return keys;
}

function b64json(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// workflowFile: e.g. 'daily-digest.yml'. Only that workflow on main in this repo is accepted.
export async function isGitHubWorkflow(req: NextRequest, workflowFile: string): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) return false;
  try {
    const header = b64json(parts[0]);
    const claims = b64json(parts[1]);
    if (header.alg !== 'RS256') return false;
    const jwk = (await githubKeys()).find(k => k.kid === header.kid);
    if (!jwk) return false;
    const ok = verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    );
    if (!ok) return false;
    const now = Math.floor(Date.now() / 1000);
    return claims.iss === GITHUB_ISSUER
      && claims.aud === GITHUB_AUDIENCE
      && typeof claims.exp === 'number' && claims.exp > now
      && typeof claims.nbf === 'number' && claims.nbf <= now + 60
      && claims.repository === GITHUB_REPO
      && claims.ref === 'refs/heads/main'
      && claims.workflow_ref === `${GITHUB_REPO}/.github/workflows/${workflowFile}@refs/heads/main`;
  } catch {
    return false;
  }
}
