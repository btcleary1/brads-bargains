import { EbayItem } from './ebay';
import { FlipData } from './notify';

async function twilioSend(toPhone: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber || !toPhone) return;
  const digits = toPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: e164, From: fromNumber, Body: body }).toString(),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Twilio SMS error ${res.status}: ${err}`); }
}

export async function sendSMSPriceDrop(
  drops: { title: string; oldPrice: number; newPrice: number; url: string }[],
  toPhone: string,
): Promise<void> {
  if (!drops.length) return;
  const d = drops[0];
  const extra = drops.length > 1 ? ` (+${drops.length - 1} more)` : '';
  const body = `Brad's Bargains price drop${extra}:\n${d.title.slice(0, 70)}\n$${d.oldPrice.toFixed(0)} → $${d.newPrice.toFixed(0)}\n${d.url}`;
  await twilioSend(toPhone, body);
}

export async function sendSMSDigest(deals: EbayItem[], toPhone: string, flipMap?: Map<string, FlipData>): Promise<void> {
  if (!deals.length) return;
  const lines = deals.slice(0, 5).map((deal, i) => {
    const flip = flipMap?.get(deal.itemId);
    const profit = flip?.netProfit ?? (deal.marketPrice ? Math.round(deal.marketPrice * 0.87 - deal.price - (deal.shippingCost ?? 0)) : null);
    const profitStr = profit && profit > 0 ? ` +$${profit}` : '';
    return `${i + 1}. ${deal.title.split(' ').slice(0, 5).join(' ')} $${deal.price.toFixed(0)}${profitStr}`;
  }).join('\n');
  await twilioSend(toPhone, `Brad's Bargains Top Deals:\n${lines}\nhttps://brads-bargains.vercel.app/deals`);
}
