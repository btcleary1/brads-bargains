import { Resend } from 'resend';
import { EbayItem } from './ebay';

export async function sendDealAlert(deals: EbayItem[], query: string, toOverride?: string): Promise<void> {
  const to = toOverride || process.env.NOTIFICATION_EMAIL;
  if (!to) return;

  const resend = new Resend(process.env.RESEND_API_KEY);

  const rows = deals.slice(0, 5).map(d => `
    <tr style="border-bottom:1px solid #E2E8F0;">
      <td style="padding:12px 8px;">
        ${d.imageUrl ? `<img src="${d.imageUrl}" width="60" height="60" style="border-radius:8px;object-fit:cover;" />` : ''}
      </td>
      <td style="padding:12px 8px;font-size:13px;color:#0F172A;">
        <a href="${d.itemUrl}" style="color:#3B82F6;font-weight:600;text-decoration:none;">${d.title}</a><br>
        <span style="color:#64748B;">${d.condition} · ${d.location}</span>
      </td>
      <td style="padding:12px 8px;text-align:right;white-space:nowrap;">
        <div style="font-size:18px;font-weight:700;color:#0F172A;">$${d.price.toFixed(2)}</div>
        ${d.marketPrice ? `<div style="font-size:12px;color:#94A3B8;text-decoration:line-through;">$${d.marketPrice.toFixed(2)}</div>` : ''}
        ${d.discountPct !== null ? `<div style="font-size:12px;font-weight:700;color:#22C55E;">${d.discountPct}% off</div>` : ''}
      </td>
    </tr>
  `).join('');

  await resend.emails.send({
    from: "Brad's Bargains <onboarding@resend.dev>",
    to,
    subject: `🔥 ${deals.length} hot deal${deals.length !== 1 ? 's' : ''} found — "${query}"`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

        <tr><td align="center" style="padding-bottom:24px;">
          <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0F172A;">🔥 Brad's Bargains Alert</h1>
          <p style="margin:0;font-size:14px;color:#64748B;">Found <strong>${deals.length} deal${deals.length !== 1 ? 's' : ''}</strong> for "<strong>${query}</strong>" at 70%+ off market price</p>
        </td></tr>

        <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${rows}
          </table>
        </td></tr>

        <tr><td align="center" style="padding-top:20px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app'}/deals"
            style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:10px;">
            View All Deals →
          </a>
        </td></tr>

        <tr><td align="center" style="padding-top:20px;">
          <p style="margin:0;font-size:12px;color:#94A3B8;">Brad's Bargains · Automated deal alert · <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app'}/settings" style="color:#94A3B8;">Manage alerts</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
