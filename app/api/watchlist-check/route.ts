import { NextRequest, NextResponse } from 'next/server';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { topDeals, sellabilityScore, modelYear } from '@/lib/deal-score';
import { getAllUsers } from '@/lib/users';
import { getSavedSearches, saveSavedSearches, getUserPrefs } from '@/lib/tracker-data';
import { sendPushToSubscriptions } from '@/lib/push-notify';
import { getSessionFromRequest as _unused } from '@/lib/session'; // eslint-disable-line @typescript-eslint/no-unused-vars

export const runtime = 'nodejs';
export const maxDuration = 60;

const SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

async function sendWatchlistAlert(
  toEmail: string,
  alerts: { query: string; deals: EbayItem[] }[]
): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').replace(/[^\x00-\xFF]/g, '');

  const rows = alerts.flatMap(({ query, deals }) =>
    deals.map(d => {
      const netProfit = d.marketPrice ? Math.round(d.marketPrice * 0.85 - d.price - (d.shippingCost ?? 0)) : null;
      const year = modelYear(d.title);
      return `
      <tr><td style="padding:0 0 12px 0;">
        <table width="100%" style="background:#FFFFFF;border-radius:10px;border:1px solid #E2E8F0;">
          <tr>
            <td style="padding:14px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:#6366F1;text-transform:uppercase;margin-bottom:6px;">
                Watchlist: ${query}
              </div>
              <a href="${d.itemUrl}" style="font-size:14px;font-weight:600;color:#0F172A;text-decoration:none;display:block;margin-bottom:6px;">${d.title.replace(/[^\x00-\xFF]/g, '').slice(0, 80)}</a>
              <div style="font-size:12px;color:#64748B;margin-bottom:8px;">
                ${d.condition}${year ? ` · ${year}` : ''} · ${d.discountPct ?? 0}% off
                ${netProfit && netProfit > 0 ? ` · <span style="color:#16A34A;font-weight:700;">~$${netProfit} net profit</span>` : ''}
              </div>
              <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px;">
                <span style="font-size:22px;font-weight:800;color:#0F172A;">$${d.price.toFixed(0)}</span>
                ${d.marketPrice ? `<span style="font-size:13px;color:#94A3B8;text-decoration:line-through;">$${d.marketPrice.toFixed(0)}</span>` : ''}
              </div>
              <a href="${d.itemUrl}" style="display:inline-block;background:#0F172A;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:5px 14px;border-radius:6px;">View on eBay</a>
            </td>
          </tr>
        </table>
      </td></tr>`;
    })
  ).join('');

  const totalDeals = alerts.reduce((n, a) => n + a.deals.length, 0);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: "Brad's Bargains <onboarding@resend.dev>",
      to: toEmail,
      subject: `Watchlist Alert — ${totalDeals} new deal${totalDeals > 1 ? 's' : ''} found`,
      html: `<!DOCTYPE html><html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
  <tr><td style="padding-bottom:20px;text-align:center;">
    <div style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);border-radius:12px;padding:10px 20px;margin-bottom:14px;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;">Brad's Bargains</span>
    </div>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0F172A;">Watchlist Alert</h1>
    <p style="margin:0;font-size:13px;color:#64748B;">New qualifying deals found for your saved searches</p>
  </td></tr>
  <tr><td><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  <tr><td style="padding:10px 0 24px;text-align:center;">
    <a href="${APP_URL}/deals" style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:10px;">Search More Deals</a>
  </td></tr>
  <tr><td style="text-align:center;">
    <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.7;">
      <a href="${APP_URL}/settings" style="color:#94A3B8;">Manage watchlist</a>
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    }),
  });

  if (res.status >= 300) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.EBAY_CLIENT_ID) {
    return NextResponse.json({ skipped: true, reason: 'eBay not configured' });
  }

  let users: Awaited<ReturnType<typeof getAllUsers>>;
  try { users = await getAllUsers(); }
  catch (err) {
    console.error('[watchlist-check] getAllUsers failed:', err);
    return NextResponse.json({ skipped: true, error: String(err) }); // 200 — no retry
  }
  const summary: { userId: string; alerts: number }[] = [];

  for (const user of users) {
    const prefs = await getUserPrefs(user.userId);
    const email = prefs.notificationEmail || process.env.NOTIFICATION_EMAIL;
    if (!email) continue;

    const searches = await getSavedSearches(user.userId);
    if (searches.length === 0) continue;

    const alerts: { query: string; deals: EbayItem[] }[] = [];
    const updatedSearches = [...searches];

    for (let i = 0; i < searches.length; i++) {
      const search = searches[i];
      try {
        const items = await searchDeals(search.query, 30);
        const best = topDeals(items, 3, search.minDiscount);

        // Only alert on items not previously notified
        const alreadySent = new Set(search.lastNotifiedIds ?? []);
        const newDeals = best.filter(d => !alreadySent.has(d.itemId));

        if (newDeals.length > 0) {
          const sorted = [...newDeals].sort((a, b) => sellabilityScore(b, newDeals) - sellabilityScore(a, newDeals));
          alerts.push({ query: search.query, deals: sorted });

          // Update notified IDs — keep last 50 to bound storage
          const allNotified = [...Array.from(alreadySent), ...newDeals.map(d => d.itemId)];
          updatedSearches[i] = {
            ...search,
            lastRunAt: new Date().toISOString(),
            lastNotifiedIds: allNotified.slice(-50),
          };
        } else {
          updatedSearches[i] = { ...search, lastRunAt: new Date().toISOString() };
        }
      } catch {
        // skip this search on error
      }
    }

    await saveSavedSearches(user.userId, updatedSearches);

    if (alerts.length > 0) {
      await sendWatchlistAlert(email, alerts).catch(() => {});
      const subs = (prefs.pushSubscriptions as object[] | undefined) ?? [];
      if (subs.length) {
        const topDeal = alerts[0]?.deals[0];
        const body = topDeal
          ? `${topDeal.title.slice(0, 60)} — $${topDeal.price} (${topDeal.discountPct ?? 0}% off)`
          : 'New watchlist deals found.';
        await sendPushToSubscriptions(subs, "Brad's Bargains — Watchlist Alert", body, '/deals').catch(() => {});
      }
      summary.push({ userId: user.userId, alerts: alerts.reduce((n, a) => n + a.deals.length, 0) });
    }
  }

  return NextResponse.json({ usersChecked: users.length, alerted: summary });
}
