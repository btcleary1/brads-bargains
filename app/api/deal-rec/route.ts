import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { checkRequestLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 10 AI recommendations per hour per user
  try { await checkRequestLimit(session.userId, 'deal-rec', 10, 3_600_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  const { items } = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ recommendation: null, pickedItemId: null });
  }

  // Only consider items the auto-grader rates as BUY (sellScore >= 45)
  const buyItems = items.filter((i: any) => i.grade === 'BUY' || (typeof i.sellScore === 'number' && i.sellScore >= 45));
  if (buyItems.length === 0) {
    return NextResponse.json({ recommendation: null, pickedItemId: null });
  }

  // Sort by sell score so Claude sees the most promising items first
  const sorted = [...buyItems].sort((a: any, b: any) => (b.sellScore ?? 0) - (a.sellScore ?? 0));
  const top = sorted.slice(0, 5);
  const best = sorted[0];

  const topList = top.map((i: any, idx: number) => {
    const profit = i.marketPrice
      ? Math.round((i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) * 100) / 100
      : null;
    return `#${idx + 1} ${i.title} — Buy: $${i.price}${i.discountPct ? ` (${i.discountPct}% off)` : ''}${i.marketPrice ? `, avg resale: $${i.marketPrice}` : ''}${profit !== null ? `, net profit after eBay fees: ~$${profit}` : ''}. Condition: ${i.condition}.`;
  }).join('\n');

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are a sharp eBay flip advisor. Given these pre-screened BUY-rated listings, recommend the single best one to flip today for resale profit. Be direct, specific, and under 50 words. No disclaimers.\n\n${topList}`,
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null;
    return NextResponse.json({ recommendation: text, pickedItemId: best.itemId });
  } catch {
    return NextResponse.json({ recommendation: null, pickedItemId: null });
  }
}
