import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers } from '@/lib/users';

export const runtime = 'nodejs';

const SECRET = process.env.DIGEST_SECRET ?? '';

function buildHtml(name: string, appUrl: string): string {
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

  <!-- Header -->
  <tr><td style="padding-bottom:24px;text-align:center;">
    <a href="${appUrl}/deals" style="display:inline-block;background:#0D1B2A;border-radius:12px;padding:10px 22px;margin-bottom:16px;text-decoration:none;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.28em;color:rgba(255,255,255,0.42);text-transform:uppercase;display:block;line-height:1;margin-bottom:3px;">AI</span>
      <span style="font-family:Impact,'Arial Narrow',Haettenschweiler,sans-serif;font-size:22px;color:#FFFFFF;letter-spacing:-0.01em;line-height:0.9;display:block;">FLIP</span>
    </a>
  </td></tr>

  <!-- Body card -->
  <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;padding:32px;">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">Same service. New name.</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.65;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.65;">
      Brad's Bargains has a new name — <strong style="color:#0F172A;">AI FLIP</strong>. Everything you know is exactly the same: your daily deal digest, flip tracker, watchlist alerts, and all your saved data.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.65;">
      Nothing changes on your end. No new sign-in, no settings to update.
    </p>
    <a href="${appUrl}/deals"
      style="display:inline-block;background:#1D4ED8;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:10px;">
      Go to AI FLIP →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.7;">
      You're receiving this because you have an AI FLIP account.<br>
      <a href="${appUrl}/settings" style="color:#94A3B8;">Manage your account</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!SECRET || secret !== SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey)
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

  const users = await getAllUsers();
  const results: { email: string; status: string }[] = [];

  for (const user of users) {
    if (!user.email) continue;

    if (dryRun) {
      results.push({ email: user.email, status: 'dry-run' });
      continue;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `AI FLIP <${fromEmail}>`,
          to: user.email,
          subject: "Brad's Bargains is now AI FLIP",
          html: buildHtml(user.name, appUrl),
        }),
      });

      if (res.ok) {
        results.push({ email: user.email, status: 'sent' });
      } else {
        const err = await res.text();
        results.push({ email: user.email, status: `error: ${res.status} ${err.slice(0, 80)}` });
      }

      // Small delay to respect Resend rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      results.push({ email: user.email, status: `exception: ${String(err).slice(0, 80)}` });
    }
  }

  const sent = results.filter(r => r.status === 'sent').length;
  const failed = results.filter(r => r.status.startsWith('error') || r.status.startsWith('exception')).length;

  return NextResponse.json({ dryRun, total: users.length, sent, failed, results });
}
