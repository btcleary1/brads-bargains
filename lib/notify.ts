import { Resend } from 'resend';
import { EbayItem } from './ebay';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

function categoryIcon(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('phone') || c.includes('iphone')) return '📱';
  if (c.includes('laptop') || c.includes('macbook') || c.includes('computer')) return '💻';
  if (c.includes('tablet') || c.includes('ipad')) return '📱';
  if (c.includes('tv') || c.includes('television')) return '📺';
  if (c.includes('watch')) return '⌚';
  if (c.includes('drone') || c.includes('camera')) return '📷';
  if (c.includes('headphone') || c.includes('audio')) return '🎧';
  if (c.includes('console') || c.includes('game') || c.includes('nintendo') || c.includes('playstation')) return '🎮';
  if (c.includes('pokemon') || c.includes('card') || c.includes('tcg')) return '🃏';
  if (c.includes('comic')) return '📚';
  if (c.includes('lego')) return '🧱';
  if (c.includes('watch') || c.includes('rolex')) return '⌚';
  if (c.includes('comic')) return '📚';
  return '🏷️';
}

function dealTierLabel(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 80) return { label: 'EXCEPTIONAL', color: '#EF4444', bg: '#FEF2F2' };
  if (pct >= 75) return { label: 'EXCELLENT',   color: '#F97316', bg: '#FFF7ED' };
  return             { label: 'GREAT DEAL',   color: '#3B82F6', bg: '#EFF6FF' };
}

function dealRow(deal: EbayItem, rank: number): string {
  const savings = deal.marketPrice ? deal.marketPrice - deal.price : 0;
  const tier = dealTierLabel(deal.discountPct ?? 0);
  const icon = categoryIcon(deal.category);
  const shipping = deal.shippingCost === 0 ? 'Free shipping' : deal.shippingCost ? `+$${deal.shippingCost.toFixed(2)} shipping` : '';

  return `
  <tr>
    <td style="padding:0 0 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr>
          <!-- Rank + icon column -->
          <td width="56" style="background:#F8FAFC;padding:16px 12px;text-align:center;vertical-align:top;border-right:1px solid #F1F5F9;">
            <div style="font-size:20px;margin-bottom:4px;">${icon}</div>
            <div style="font-size:11px;font-weight:700;color:#94A3B8;">#${rank}</div>
          </td>

          <!-- Item details -->
          <td style="padding:14px 16px;vertical-align:top;">
            <div style="margin-bottom:6px;">
              <span style="font-size:10px;font-weight:800;letter-spacing:0.08em;color:${tier.color};background:${tier.bg};padding:2px 8px;border-radius:4px;">${tier.label}</span>
            </div>
            <a href="${deal.itemUrl}" style="font-size:14px;font-weight:600;color:#0F172A;text-decoration:none;line-height:1.4;display:block;margin-bottom:4px;">${deal.title}</a>
            <div style="font-size:12px;color:#64748B;">${deal.condition} · ${deal.location}${shipping ? ' · ' + shipping : ''}</div>
          </td>

          <!-- Price column -->
          <td width="110" style="padding:14px 16px;text-align:right;vertical-align:top;white-space:nowrap;">
            <div style="font-size:22px;font-weight:800;color:#0F172A;line-height:1;">$${deal.price.toFixed(0)}</div>
            ${deal.marketPrice ? `<div style="font-size:12px;color:#94A3B8;text-decoration:line-through;margin-top:2px;">$${deal.marketPrice.toFixed(0)}</div>` : ''}
            <div style="font-size:13px;font-weight:700;color:#22C55E;margin-top:2px;">${deal.discountPct}% off</div>
            ${savings > 0 ? `<div style="font-size:11px;color:#64748B;margin-top:1px;">Save $${savings.toFixed(0)}</div>` : ''}
            <a href="${deal.itemUrl}" style="display:inline-block;margin-top:8px;background:#0F172A;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:5px 12px;border-radius:6px;">View &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export async function sendDailyDigest(deals: EbayItem[], toEmail: string): Promise<void> {
  if (deals.length === 0) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const top5 = deals.slice(0, 5);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const rows = top5.map((d, i) => dealRow(d, i + 1)).join('');

  await resend.emails.send({
    from: "Brad's Bargains <onboarding@resend.dev>",
    to: toEmail,
    subject: `Today's Top 5 Deals — ${today}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

  <!-- Header -->
  <tr><td style="padding-bottom:24px;text-align:center;">
    <div style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);border-radius:14px;padding:10px 18px;margin-bottom:16px;">
      <span style="font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">⚡ Brad's Bargains</span>
    </div>
    <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#0F172A;letter-spacing:-0.5px;">Today's Top 5 Deals</h1>
    <p style="margin:0;font-size:14px;color:#64748B;">${today} · Electronics &amp; Collectibles · 70%+ off market price</p>
  </td></tr>

  <!-- Deal rows -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${rows}
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:8px 0 24px;text-align:center;">
    <a href="${APP_URL}/deals"
      style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.2px;">
      Search More Deals &rarr;
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="text-align:center;padding-top:8px;">
    <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.6;">
      You're receiving this because you enabled deal alerts.<br>
      <a href="${APP_URL}/settings" style="color:#94A3B8;">Manage alert email</a> · <a href="${APP_URL}/tracker" style="color:#94A3B8;">Track your flips</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  });
}

// Legacy per-search alert — kept for backwards compat but digest is preferred
export async function sendDealAlert(deals: EbayItem[], query: string, toOverride?: string): Promise<void> {
  await sendDailyDigest(deals, toOverride || process.env.NOTIFICATION_EMAIL || '');
}
