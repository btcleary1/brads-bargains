import { EbayItem } from './ebay';
import { sellabilityScore, sellabilityLabel, modelYear } from './deal-score';

export interface FlipData {
  verdict: 'buy' | 'maybe' | 'skip';
  netProfit: number;
  avgSoldPrice: number;
  soldCount: number;
  marginPct: number;
  estDaysToSell?: number | null;
  sourcesCount?: number | null;
  stockxLastSale?: number | null;
  mercariAvgSold?: number | null;
  amazonPrice?: number | null;
}

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

export function buildSpotlightUrl(deal: EbayItem, flip?: FlipData, displayNetProfit?: number | null): string {
  const payload = Buffer.from(JSON.stringify({
    itemId: deal.itemId,
    title: deal.title,
    price: deal.price,
    marketPrice: deal.marketPrice,
    discountPct: deal.discountPct,
    condition: deal.condition,
    imageUrl: deal.imageUrl,
    itemUrl: deal.itemUrl,
    category: deal.category,
    shippingCost: deal.shippingCost,
    flipVerdict: flip?.verdict ?? null,
    avgSoldPrice: flip?.avgSoldPrice ?? null,
    soldCount: flip?.soldCount ?? null,
    flipNetProfit: displayNetProfit ?? flip?.netProfit ?? null,
    estDaysToSell: flip?.estDaysToSell ?? null,
    sourcesCount: flip?.sourcesCount ?? null,
    stockxLastSale: flip?.stockxLastSale ?? null,
    mercariAvgSold: flip?.mercariAvgSold ?? null,
    amazonPrice: flip?.amazonPrice ?? null,
  })).toString('base64url');
  return `${APP_URL}/deals?spotlight=${payload}`;
}

function buildTrackUrl(deal: EbayItem): string {
  const payload = Buffer.from(JSON.stringify({
    ebayItemId: deal.itemId,
    title: deal.title,
    ebayPrice: deal.price,
    marketPrice: deal.marketPrice,
    discountPct: deal.discountPct,
    condition: deal.condition,
    imageUrl: deal.imageUrl,
    ebayUrl: deal.itemUrl,
    category: deal.category,
    shippingCost: deal.shippingCost,
  })).toString('base64url');
  return `${APP_URL}/tracker?add=${payload}`;
}

function listingAgeBadge(listingDate: string | null): string {
  if (!listingDate) return '';
  const days = Math.floor((Date.now() - new Date(listingDate).getTime()) / 86400000);
  if (days <= 1)  return `<span style="font-size:10px;font-weight:800;letter-spacing:0.06em;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;padding:2px 7px;border-radius:4px;">NEW TODAY</span>`;
  if (days <= 3)  return `<span style="font-size:10px;font-weight:700;color:#D97706;background:#FFF7ED;border:1px solid #FED7AA;padding:2px 7px;border-radius:4px;">Listed ${days}d ago</span>`;
  if (days <= 7)  return `<span style="font-size:10px;font-weight:700;color:#0369A1;background:#F0F9FF;border:1px solid #BAE6FD;padding:2px 7px;border-radius:4px;">Listed ${days}d ago</span>`;
  if (days <= 30) return `<span style="font-size:10px;color:#64748B;background:#F8FAFC;border:1px solid #E2E8F0;padding:2px 7px;border-radius:4px;">Listed ${days}d ago</span>`;
  return `<span style="font-size:10px;color:#94A3B8;background:#F8FAFC;border:1px solid #E2E8F0;padding:2px 7px;border-radius:4px;">Listed ${days}d ago</span>`;
}

function flipRow(flip: FlipData, annROI?: number | null): string {
  const verdictColor = flip.verdict === 'buy' ? '#16A34A' : flip.verdict === 'maybe' ? '#D97706' : '#DC2626';
  const verdictBg    = flip.verdict === 'buy' ? '#F0FDF4' : flip.verdict === 'maybe' ? '#FFFBEB' : '#FEF2F2';
  const verdictBorder= flip.verdict === 'buy' ? '#BBF7D0' : flip.verdict === 'maybe' ? '#FDE68A' : '#FECACA';
  const label        = flip.verdict === 'buy' ? '✓ BUY' : flip.verdict === 'maybe' ? '~ MAYBE' : '✗ SKIP';
  const roiColor = annROI != null ? (annROI >= 200 ? '#16A34A' : annROI >= 100 ? '#D97706' : '#94A3B8') : '';
  const sourceParts: string[] = [];
  if (flip.avgSoldPrice > 0) sourceParts.push(`<span style="font-size:10px;color:#475569;">eBay&nbsp;<strong>$${flip.avgSoldPrice.toFixed(0)}</strong>&nbsp;(${flip.soldCount})</span>`);
  if (flip.stockxLastSale) sourceParts.push(`<span style="font-size:10px;color:#475569;">StockX&nbsp;<strong>$${flip.stockxLastSale.toFixed(0)}</strong></span>`);
  if (flip.mercariAvgSold) sourceParts.push(`<span style="font-size:10px;color:#475569;">Mercari&nbsp;<strong>$${flip.mercariAvgSold.toFixed(0)}</strong></span>`);
  if (flip.amazonPrice) sourceParts.push(`<span style="font-size:10px;color:#475569;">Amazon&nbsp;<strong>$${flip.amazonPrice.toFixed(0)}</strong></span>`);
  return `<div style="margin-top:8px;padding:10px 12px;background:${verdictBg};border:1px solid ${verdictBorder};border-radius:6px;">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
      <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:${verdictColor};">${label}</span>
      ${flip.netProfit > 0 ? `<span style="font-size:12px;font-weight:700;color:#16A34A;">+$${flip.netProfit} Net Profit</span>` : `<span style="font-size:11px;color:#DC2626;">Low margin</span>`}
      ${flip.estDaysToSell != null ? `<span style="font-size:11px;color:#64748B;">~${flip.estDaysToSell}d to sell</span>` : ''}
      ${annROI != null && annROI > 0 && annROI <= 2000 ? `<span style="font-size:11px;color:${roiColor};">${annROI}% ann. ROI</span>` : ''}
    </div>
    ${flip.avgSoldPrice > 0 ? `<div style="font-size:11px;color:#475569;margin-bottom:${sourceParts.length >= 1 ? '4' : '0'}px;">Avg sold <strong>$${flip.avgSoldPrice.toFixed(0)}</strong> &middot; ${flip.soldCount} comps</div>` : ''}
    ${sourceParts.length >= 1 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid ${verdictBorder};">${sourceParts.join('<span style="color:#CBD5E1;">&nbsp;·&nbsp;</span>')}</div>` : ''}
  </div>`;
}

function dealRow(deal: EbayItem, rank: number, allDeals: EbayItem[], flip?: FlipData): string {
  const title    = safe(deal.title);
  const location = safe(deal.location);
  const condition = safe(deal.condition);
  const savings = deal.marketPrice ? deal.marketPrice - deal.price : 0;
  // Use sold-comps net profit first (more accurate), fall back to marketPrice estimate
  const netProfit = flip?.netProfit != null
    ? flip.netProfit
    : deal.marketPrice ? Math.round(deal.marketPrice * 0.85 - deal.price - (deal.shippingCost ?? 0)) : null;
  const annROI = flip && flip.netProfit > 0 && flip.estDaysToSell != null && flip.estDaysToSell >= 1
    ? Math.round((flip.netProfit / deal.price / flip.estDaysToSell) * 365 * 100)
    : null;
  const tier = tierLabel(deal.discountPct ?? 0);
  const cat = categoryLabel(deal.category);
  const sellScore = sellabilityScore(deal, allDeals);
  const sell = sellabilityLabel(sellScore);
  const ageBadge = listingAgeBadge(deal.listingDate);
  const year = modelYear(deal.title);
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

        <!-- Main content row -->
        <tr>

          <!-- Rank + category -->
          <td width="44" style="background:#F8FAFC;padding:14px 6px;text-align:center;vertical-align:top;border-right:1px solid #F1F5F9;">
            <div style="font-size:17px;font-weight:800;color:#0F172A;line-height:1;">#${rank}</div>
            <div style="font-size:9px;font-weight:700;color:#94A3B8;margin-top:4px;letter-spacing:0.04em;text-transform:uppercase;">${cat}</div>
          </td>

          <!-- All content: badges, title, meta, price row, buttons -->
          <td style="padding:14px 14px 12px 14px;vertical-align:top;">

            <!-- Badges -->
            <div style="margin-bottom:7px;">
              <span style="font-size:10px;font-weight:800;letter-spacing:0.07em;color:${tier.color};background:${tier.bg};border:1px solid ${tier.border};padding:2px 7px;border-radius:4px;display:inline-block;margin-right:4px;margin-bottom:4px;">${tier.label}</span>
              <span style="font-size:10px;font-weight:700;color:${sell.color};background:${sell.bg};border:1px solid ${sell.border};padding:2px 7px;border-radius:4px;display:inline-block;margin-right:4px;margin-bottom:4px;">${sell.label}</span>
              ${ageBadge ? `<span style="display:inline-block;margin-bottom:4px;">${ageBadge}</span>` : ''}
            </div>

            <!-- Title -->
            <a href="${deal.itemUrl}"
              style="font-size:14px;font-weight:700;color:#0F172A;text-decoration:none;line-height:1.4;display:block;margin-bottom:5px;">${title}</a>

            <!-- Meta -->
            <div style="font-size:12px;color:#64748B;margin-bottom:4px;">
              ${condition}${year ? ` &middot; <span style="font-weight:600;color:#475569;">${year}</span>` : ''} &middot; ${location}${shipping ? ' &middot; ' + shipping : ''}
            </div>
            ${deal.sellerFeedbackPercent !== null
              ? `<div style="font-size:11px;color:#64748B;margin-bottom:6px;">
                  Seller: ${safe(deal.seller)} &middot; ${deal.sellerFeedbackPercent}% (${deal.sellerFeedbackScore?.toLocaleString()} ratings)
                 </div>`
              : ''}

            <!-- Price + profit row -->
            <div style="margin:8px 0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
              <span style="font-size:22px;font-weight:800;color:#0F172A;line-height:1;">$${deal.price.toFixed(0)}</span>
              ${deal.marketPrice ? `<span style="font-size:13px;color:#94A3B8;text-decoration:line-through;">$${deal.marketPrice.toFixed(0)}</span>` : ''}
              ${deal.discountPct ? `<span style="font-size:12px;font-weight:700;color:#94A3B8;">${deal.discountPct}% off</span>` : ''}
              ${netProfit !== null && netProfit > 0 ? `<span style="font-size:13px;font-weight:800;color:#16A34A;">+$${netProfit} profit</span>` : ''}
            </div>

            <!-- Flip data -->
            ${flip ? flipRow(flip, annROI) : '<div style="margin-top:8px;padding:8px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;font-size:11px;color:#94A3B8;">No comps available</div>'}

            <!-- CTA buttons — 3-up row, each block fills equal width -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
              <tr>
                <td width="33%" style="padding-right:3px;">
                  <a href="${deal.itemUrl}"
                    style="display:block;text-align:center;background:#0F172A;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:7px 4px;border-radius:7px;">View on eBay</a>
                </td>
                <td width="34%" style="padding:0 2px;">
                  <a href="${buildSpotlightUrl(deal, flip, netProfit)}"
                    style="display:block;text-align:center;background:#6366F1;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:7px 4px;border-radius:7px;">Brad's Bargains</a>
                </td>
                <td width="33%" style="padding-left:3px;">
                  <a href="${buildTrackUrl(deal)}"
                    style="display:block;text-align:center;background:#1D4ED8;color:#FFFFFF;font-size:11px;font-weight:600;text-decoration:none;padding:7px 4px;border-radius:7px;">Track Deal</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>


      </table>
    </td>
  </tr>`;
}

export async function sendDailyDigest(deals: EbayItem[], toEmail: string, aiPick?: string, flipMap?: Map<string, FlipData>): Promise<void> {
  if (deals.length === 0 || !toEmail) return;

  const apiKey = (process.env.SENDGRID_API_KEY ?? '').replace(/[^\x00-\xFF]/g, '');
  const top5 = deals.slice(0, 5);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const rows = top5.map((d, i) => dealRow(d, i + 1, top5, flipMap?.get(d.itemId))).join('');

  const aiPickHtml = aiPick ? `
  <!-- AI Pick -->
  <tr><td style="padding-bottom:18px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#EFF6FF;border-radius:10px;border:1px solid #BFDBFE;overflow:hidden;">
      <tr>
        <td width="44" style="padding:14px 10px;text-align:center;vertical-align:top;">
          <div style="font-size:22px;">🤖</div>
        </td>
        <td style="padding:14px 14px 14px 4px;vertical-align:top;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.07em;color:#1D4ED8;text-transform:uppercase;margin-bottom:4px;">AI Pick of the Day</div>
          <div style="font-size:13px;color:#1E3A5F;line-height:1.5;">${safe(aiPick.replace(/\*\*/g, ''))}</div>
        </td>
      </tr>
    </table>
  </td></tr>` : '';

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- Header -->
  <tr><td style="padding-bottom:22px;text-align:center;">
    <a href="${APP_URL}/deals?view=digest" style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#6366F1);border-radius:12px;padding:10px 20px;margin-bottom:14px;text-decoration:none;">
      <span style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;">Brad's Bargains</span>
    </a>
    <h1 style="margin:0 0 5px;font-size:24px;font-weight:800;color:#0F172A;letter-spacing:-0.5px;">Today's Top 5 Deals</h1>
    <p style="margin:0;font-size:13px;color:#64748B;">${today} &middot; Electronics &amp; Collectibles &middot; Best deals today</p>
  </td></tr>

  <!-- AI Pick -->
  ${aiPickHtml}

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
</html>`;

  const emailRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: process.env.SENDGRID_FROM_EMAIL ?? 'btcleary1@gmail.com', name: "Brad's Bargains" },
      subject: "Today's Top 5 Deals - " + today,
      content: [{ type: 'text/html', value: htmlBody }],
    }),
  });
  if (emailRes.status >= 300) {
    const errText = await emailRes.text();
    throw new Error('SendGrid error ' + emailRes.status + ': ' + errText);
  }
}

// Legacy alias
export async function sendDealAlert(deals: EbayItem[], _query: string, toOverride?: string): Promise<void> {
  await sendDailyDigest(deals, toOverride || process.env.NOTIFICATION_EMAIL || '');
}
