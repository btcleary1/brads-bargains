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
    return NextResponse.json({ recommendation: null });
  }

  const top = items.slice(0, 10).map((i: any) => {
    const netProfit = i.marketPrice ? Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) : null;
    return `[id:${i.itemId}] ${i.title} — buy $${i.price}, market $${i.marketPrice ?? 'unknown'}${netProfit != null ? `, ~$${netProfit} net profit` : ''}. Condition: ${i.condition}.`;
  }).join('\n');

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are a sharp eBay flip advisor. Net profit already accounts for eBay fees. Recommend the single best item to buy today for resale profit.\n\nRespond with ONLY a JSON object:\n{"recommendation": "<name the item directly, reference net profit, under 50 words, no markdown>", "pickedItemId": "<the exact id: value from the chosen item>"}\n\n${top}`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return NextResponse.json({ recommendation: parsed.recommendation ?? null, pickedItemId: parsed.pickedItemId ?? null });
    }
    return NextResponse.json({ recommendation: raw || null, pickedItemId: null });
  } catch {
    return NextResponse.json({ recommendation: null, pickedItemId: null });
  }
}
