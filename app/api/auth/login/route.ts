import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, hashPassword } from '@/lib/users';
import { setSessionCookie } from '@/lib/session';
import { checkRateLimit, recordFailure, clearFailures } from '@/lib/rate-limit';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    await checkRateLimit(ip);

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      await recordFailure(ip);
      logAudit({ timestamp: new Date().toISOString(), userId: user?.userId ?? 'unknown', email: email ?? 'unknown', action: 'login_failure', ip });
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }

    await clearFailures(ip);
    logAudit({ timestamp: new Date().toISOString(), userId: user.userId, email: user.email, action: 'login_success', ip });

    const res = NextResponse.json({ success: true, name: user.name });
    setSessionCookie(res, {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith('Too many') ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
