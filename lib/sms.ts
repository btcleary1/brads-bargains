import { EbayItem } from './ebay';
import { FlipData } from './notify';

// Carrier email-to-SMS gateways
const CARRIER_GATEWAYS: Record<string, string> = {
  att: 'txt.att.net',
  attnet: 'txt.att.net',
  verizon: 'vtext.com',
  tmobile: 'tmomail.net',
  't-mobile': 'tmomail.net',
  sprint: 'messaging.sprintpcs.com',
  cricket: 'sms.cricketwireless.net',
  boost: 'sms.myboostmobile.com',
  metro: 'mymetropcs.com',
  uscellular: 'email.uscc.net',
};

export function phoneToSMSEmail(phone: string, carrier: string): string | null {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return null;
  const gateway = CARRIER_GATEWAYS[carrier.toLowerCase().replace(/\s/g, '')];
  if (!gateway) return null;
  return `${digits}@${gateway}`;
}

export async function sendSMSDigest(deals: EbayItem[], toPhone: string, flipMap?: Map<string, FlipData>): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !toPhone) return;

  // Support direct email-to-SMS address or a stored gateway email
  const toAddress = toPhone.includes('@') ? toPhone : null;
  if (!toAddress) return; // no gateway configured

  const top5 = deals.slice(0, 5);
  const lines = top5.map((deal, i) => {
    const flip = flipMap?.get(deal.itemId);
    const profit = flip?.netProfit
      ?? (deal.marketPrice ? Math.round(deal.marketPrice * 0.85 - deal.price - (deal.shippingCost ?? 0)) : null);
    const profitStr = profit && profit > 0 ? ` +$${profit}` : '';
    const shortTitle = deal.title.split(' ').slice(0, 5).join(' ');
    return `${i + 1}. ${shortTitle} $${deal.price.toFixed(0)}${profitStr}`;
  }).join('\n');

  const body = `Brad's Bargains Top Deals:\n${lines}\nhttps://brads-bargains.vercel.app/deals`;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toAddress }] }],
      from: { email: 'btcleary1@gmail.com', name: "Brad's Bargains" },
      subject: "Today's Deals",
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid SMS error ${res.status}: ${err}`);
  }
}
