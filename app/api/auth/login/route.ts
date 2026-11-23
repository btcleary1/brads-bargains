import { HUMAN_CHECK_FAILED, isBotTrap, verifyHuman } from '@/lib/turnstile';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, verifyPassword, upgradePasswordHash, incrementLoginCount } from '@/lib/users';
import { setSessionCookie } from '@/lib/session';
import { checkRateLimit, checkRequestLimit, recordFailure, clearFailures } from '@/lib/rate-limit';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    await checkRateLimit(ip);

    const { email, password, turnstile, website } = await req.json();
    // Bots: the hidden trap field, then Cloudflare's human check (Cleary suite baseline).
    if (isBotTrap(website)) return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    if (!(await verifyHuman(turnstile, ip))) return NextResponse.json({ error: HUMAN_CHECK_FAILED }, { status: 400 });
    // Per-account limit too, so one account can't be guessed at from many addresses.
    if (email) await checkRequestLimit(String(email).trim().toLowerCase(), 'login_acct', 10, 30 * 60 * 1000);

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user))) {
      await recordFailure(ip);
      logAudit({ timestamp: new Date().toISOString(), userId: user?.userId ?? 'unknown', email: email ?? 'unknown', action: 'login_failure', ip });
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }

    await clearFailures(ip);
    logAudit({ timestamp: new Date().toISOString(), userId: user.userId, email: user.email, action: 'login_success', ip });
    await incrementLoginCount(user.userId);
    // Auto-upgrade legacy SHA256 hashes to scrypt on next successful login
    if (!user.hashVersion || user.hashVersion === 'sha256') {
      await upgradePasswordHash(user.userId, password);
    }

    const safeName = user.name.replace(/[^\u0000-\u00FF]/g, '').trim() || user.email;
    const res = NextResponse.json({ success: true, name: safeName });
    setSessionCookie(res, {
      userId: user.userId,
      email: user.email,
      name: safeName,
      role: user.role,
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith('Too many') || msg.startsWith('Rate limit') ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
