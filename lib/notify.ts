import { EbayItem } from './ebay';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

// Strip any non-Latin-1 characters from strings that end up in email HTML
function safe(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, '');
}

function categoryLabel(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('phone') || c.includes('iphone')) return 'Phone';
  if (c.includes('laptop') || c.includes('macbook') || c.includes('computer')) return 'Laptop';
  if (c.includes('tablet') || c.includes('ipad')) return 'Tablet';
  if (c.includes('tv') || c.includes('television')) return 'TV';
  if (c.includes('drone')) return 'Drone';
  if (c.includes('camera')) return 'Camera';
  if (c.includes('headphone') || c.includes('audio')) return 'Audio';
  if (c.includes('console') || c.includes('game') || c.includes('nintendo') || c.includes('playstation')) return 'Gaming';
  if (c.includes('pokemon') || c.includes('tcg')) return 'Pokemon';
  if (c.includes('card')) return 'Card';
  if (c.includes('comic')) return 'Comic';
  if (c.includes('lego')) return 'LEGO';
  if (c.includes('watch')) return 'Watch';
  return 'Deal';
}

function tierLabel(pct: number): { label: string; color: string; bg: string; border: string } {
  if (pct >= 80) return { label: 'EXCEPTIONAL', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' };
  if (pct >= 75) return { label: 'EXCELLENT',   color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA' };
  return             { label: 'GREAT DEAL',   color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
}

function dealRow(deal: EbayItem, rank: number): string {
  const title    = safe(deal.title);
  const location = safe(deal.location);
  const condition = safe(deal.condition);
  const savings = deal.marketPrice ? deal.marketPrice - deal.price : 0;
  const tier = tierLabel(deal.discountPct ?? 0);
  const cat = categoryLabel(deal.category);
  const shipping = deal.shippingCost === 0
    ? 'Free shipping'
    : deal.shippingCost
    ? '+$' + deal.shippingCost.toFixed(2) + ' ship'
    : '';

  return `
  <tr>
    <td style="padding:0 0 14px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#FFFFFF;border-radius:10px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr>

          <!-- Rank + category -->
          <td width="52" style="background:#F8FAFC;padding:16px 8px;text-align:center;vertical-align:top;border-right:1px solid #F1F5F9;">
            <div style="font-size:18px;font-weight:800;color:#0F172A;line-height:1;">#${rank}</div>
            <div style="font-size:9px;font-weight:700;color:#94A3B8;margin-top:4px;letter-spacing:0.04em;text-transform:uppercase;">${cat}</div>
          </td>

          <!-- Item info -->
          <td style="padding:14px 14px;vertical-align:top;">
            <div style="margin-bottom:6px;">
              <span style="font-size:10px;font-weight:800;letter-spacing:0.07em;color:${tier.color};background:${tier.bg};border:1px solid ${tier.border};padding:2px 7px;border-radius:4px;">${tier.label}</span>
            </div>
            <a href="${deal.itemUrl}"
              style="font-size:14px;font-weight:600;color:#0F172A;text-decoration:none;line-height:1.4;display:block;margin-bottom:5px;">${title}</a>
            <div style="font-size:12px;color:#64748B;">
              ${condition} &middot; ${location}${shipping ? ' &middot; ' + shipping : ''}
            </div>
            ${deal.sellerFeedbackPercent !== null
              ? `<div style="font-size:11px;color:#64748B;margin-top:3px;">
                  Seller: ${safe(deal.seller)}
                  &middot; ${deal.sellerFeedbackPercent}% (${deal.sellerFeedbackScore?.toLocaleString()} ratings)
                 </div>`
              : ''}
          </td>

          <!-- Price -->
          <td width="100" style="padding:14px 14px;text-align:right;vertical-align:top;white-space:nowrap;">
            <div style="font-size:22px;font-weight:800;color:#0F172A;line-height:1;">$${deal.price.toFixed(0)}</div>
            ${deal.marketPrice
              ? `<div style="font-size:12px;color:#94A3B8;text-decoration:line-through;margin-top:2px;">$${deal.marketPrice.toFixed(0)}</div>`
              : ''}
            <div style="font-size:13px;font-weight:700;color:#16A34A;margin-top:2px;">${deal.discountPct}% off</div>
            ${savings > 0
              ? `<div style="font-size:11px;color:#64748B;margin-top:1px;">Save $${savings.toFixed(0)}</div>`
              : ''}
            <a href="${deal.itemUrl}"
              style="display:inline-block;margin-top:8px;background:#0F172A;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:5px 12px;border-radius:6px;">View</a>
          </td>

        </tr>
      </table>
    </td>
  </tr>`;
}

export async function sendDailyDigest(deals: EbayItem[], toEmail: string): Promise<void> {
  if (deals.length === 0 || !toEmail) return;

  const apiKey = (process.env.RESEND_API_KEY ?? '').replace(/[^\x00-\xFF]/g, '');
  const top5 = deals.slice(0, 5);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const rows = top5.map((d, i) => dealRow(d, i + 1)).join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: "Brad's Bargains <onboarding@resend.dev>",
      to: toEmail,
      subject: "Today's Top 5 Deals - " + today,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- Header -->
  <tr><td style="padding-bottom:22px;text-align:center;">
    <div style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);border-radius:12px;padding:10px 20px;margin-bottom:14px;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;">Brad's Bargains</span>
    </div>
    <h1 style="margin:0 0 5px;font-size:24px;font-weight:800;color:#0F172A;letter-spacing:-0.5px;">Today's Top 5 Deals</h1>
    <p style="margin:0;font-size:13px;color:#64748B;">${today} &middot; Electronics &amp; Collectibles &middot; 70%+ off market price</p>
  </td></tr>

  <!-- Deals -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:10px 0 24px;text-align:center;">
    <a href="${APP_URL}/deals"
      style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:10px;">
      Search More Deals
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="text-align:center;">
    <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.7;">
      You receive this because you enabled deal alerts.<br>
      <a href="${APP_URL}/settings" style="color:#94A3B8;">Manage alerts</a>
      &nbsp;&middot;&nbsp;
      <a href="${APP_URL}/tracker" style="color:#94A3B8;">Track your flips</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
    }),
  });
}

// Legacy alias
export async function sendDealAlert(deals: EbayItem[], _query: string, toOverride?: string): Promise<void> {
  await sendDailyDigest(deals, toOverride || process.env.NOTIFICATION_EMAIL || '');
}
