import { NextRequest, NextResponse } from 'next/server';
import { getItemDetail } from '@/lib/ebay';
import { getAllUsers } from '@/lib/users';
import { getDeals, saveDeals } from '@/lib/tracker-data';
import { getUserPrefs } from '@/lib/tracker-data';
import { sendSMSPriceDrop } from '@/lib/sms';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PRICE_CHECK_SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

async function sendPriceDropEmail(toEmail: string, drops: { title: string; oldPrice: number; newPrice: number; saving: number; url: string }[]): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').replace(/[^\x00-\xFF]/g, '');
  const rows = drops.map(d => `
    <tr><td style="padding:0 0 12px 0;">
      <table width="100%" style="background:#FFFFFF;border-radius:10px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:14px;">
            <a href="${d.url}" style="font-size:14px;font-weight:600;color:#0F172A;text-decoration:none;display:block;margin-bottom:8px;">${d.title.slice(0, 80)}</a>
            <div style="display:flex;gap:12px;align-items:center;">
              <span style="font-size:20px;font-weight:800;color:#0F172A;">$${d.newPrice.toFixed(0)}</span>
              <span style="font-size:13px;color:#94A3B8;text-decoration:line-through;">$${d.oldPrice.toFixed(0)}</span>
              <span style="font-size:13px;font-weight:700;color:#16A34A;">Save $${d.saving.toFixed(0)}</span>
            </div>
            <a href="${d.url}" style="display:inline-block;margin-top:10px;background:#0F172A;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:5px 14px;border-radius:6px;">View on eBay</a>
          </td>
        </tr>
      </table>
    </td></tr>`).join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: "Brad's Bargains <onboarding@resend.dev>",
      to: toEmail,
      subject: `Price Drop Alert — ${drops.length} deal${drops.length > 1 ? 's' : ''} got cheaper!`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
  <tr><td style="padding-bottom:20px;text-align:center;">
    <div style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);border-radius:12px;padding:10px 20px;margin-bottom:14px;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;">Brad's Bargains</span>
    </div>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0F172A;">Price Drop Alert</h1>
    <p style="margin:0;font-size:13px;color:#64748B;">Deals you're watching just got cheaper</p>
  </td></tr>
  <tr><td><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  <tr><td style="padding:10px 0 24px;text-align:center;">
    <a href="${APP_URL}/tracker" style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:10px;">View Tracker</a>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    }),
  });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== PRICE_CHECK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.EBAY_CLIENT_ID) {
    return NextResponse.json({ skipped: true, reason: 'eBay not configured' });
  }

  const users = await getAllUsers();
  const summary: { userId: string; drops: number }[] = [];

  for (const user of users) {
    const deals = await getDeals(user.userId);
    const watching = deals.filter(d => d.status === 'watching' && d.ebayItemId);
    if (watching.length === 0) continue;

    const drops: { title: string; oldPrice: number; newPrice: number; saving: number; url: string }[] = [];
    const updatedDeals = [...deals];

    const today = new Date().toISOString().slice(0, 10);

    for (const deal of watching) {
      try {
        const current = await getItemDetail(deal.ebayItemId);
        if (!current) continue;

        const idx = updatedDeals.findIndex(d => d.id === deal.id);
        if (idx === -1) continue;

        // Record price snapshot (one per day — skip if already recorded today)
        const history = updatedDeals[idx].priceHistory ?? [];
        const alreadyToday = history.some(h => h.date === today);
        const newHistory = alreadyToday ? history : [...history, { date: today, price: current.price }];
        updatedDeals[idx] = { ...updatedDeals[idx], priceHistory: newHistory };

        if (current.price < deal.ebayPrice - 0.50) {
          drops.push({
            title: deal.title,
            oldPrice: deal.ebayPrice,
            newPrice: current.price,
            saving: deal.ebayPrice - current.price,
            url: deal.ebayUrl,
          });
          updatedDeals[idx] = { ...updatedDeals[idx], ebayPrice: current.price };
        }
      } catch { /* skip this item */ }
    }

    // Always save to persist price history snapshots
    await saveDeals(user.userId, updatedDeals);

    if (drops.length > 0) {
      const prefs = await getUserPrefs(user.userId);
      const email = prefs.notificationEmail || process.env.NOTIFICATION_EMAIL;
      if (email) await sendPriceDropEmail(email, drops).catch(() => {});
      if (prefs.notificationPhone) await sendSMSPriceDrop(drops, prefs.notificationPhone).catch(() => {});
      summary.push({ userId: user.userId, drops: drops.length });
    }
  }

  return NextResponse.json({ checked: users.length, priceDrops: summary });
}
