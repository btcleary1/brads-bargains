import { NextRequest, NextResponse } from 'next/server';
import { createUser, userCount } from '@/lib/users';
import { validatePassword } from '@/lib/password-rules';
import { setSessionCookie } from '@/lib/session';
import { checkRateLimit, recordFailure } from '@/lib/rate-limit';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    await checkRateLimit(ip);
    const { email, name, password } = await req.json();
    if (!email || !name || !password)
      return NextResponse.json({ error: 'Email, name, and password are required.' }, { status: 400 });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

    const { valid, errors } = validatePassword(password);
    if (!valid)
      return NextResponse.json({ error: `Password requirements not met: ${errors.join(', ')}.` }, { status: 400 });

    const count = await userCount();
    const role = count === 0 ? 'admin' : 'user';
    const user = await createUser(email, name, password, role);
    logAudit({ timestamp: new Date().toISOString(), userId: user.userId, email: user.email, action: 'register', ip });

    // Welcome email — fire and forget
    try {
      const apiKey = (process.env.RESEND_API_KEY ?? '').replace(/[^\x00-\xFF]/g, '');
      const firstName = name.trim().split(/\s+/)[0].replace(/[^\x00-\xFF]/g, '');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: "Brad's Bargains <onboarding@resend.dev>",
          to: email,
          subject: "Welcome to Brad's Bargains - Start finding flips",
          html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;background:#050814;">
  <div style="background:#0B1120;border-radius:20px;border:1px solid rgba(255,255,255,0.1);padding:36px;">
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#F9FAFB;">Welcome, ${firstName}!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#9CA3AF;line-height:1.6;">
      Your Brad's Bargains account is ready. Find the best eBay deals, track your flips, and get daily alerts on the best opportunities.
    </p>
    <a href="${appUrl}/deals"
      style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;">
      Find Deals
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#6B7280;">Not a financial tool. All purchases are your responsibility.</p>
  </div>
</div>`,
        }),
      });
    } catch { /* email failure never blocks registration */ }

    const res = NextResponse.json({ success: true, name: user.name });
    setSessionCookie(res, { userId: user.userId, email: user.email, name: user.name, role: user.role });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('Too many'))
      return NextResponse.json({ error: msg }, { status: 429 });
    await recordFailure(ip);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
