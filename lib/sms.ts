import { EbayItem } from './ebay';
import { FlipData } from './notify';

export async function sendSMSDigest(deals: EbayItem[], toPhone: string, flipMap?: Map<string, FlipData>): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !toPhone) return;

  // Normalize to E.164 — strip non-digits, add +1 if needed
  const digits = toPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  const top5 = deals.slice(0, 5);
  const lines = top5.map((deal, i) => {
    const flip = flipMap?.get(deal.itemId);
    const profit = flip?.netProfit
      ?? (deal.marketPrice ? Math.round(deal.marketPrice * 0.87 - deal.price - (deal.shippingCost ?? 0)) : null);
    const profitStr = profit && profit > 0 ? ` +$${profit}` : '';
    const shortTitle = deal.title.split(' ').slice(0, 5).join(' ');
    return `${i + 1}. ${shortTitle} $${deal.price.toFixed(0)}${profitStr}`;
  }).join('\n');

  const body = `Brad's Bargains Top Deals:\n${lines}\nhttps://brads-bargains.vercel.app/deals`;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: e164, From: fromNumber, Body: body }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio SMS error ${res.status}: ${err}`);
  }
}
