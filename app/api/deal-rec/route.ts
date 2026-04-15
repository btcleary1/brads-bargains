import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { items } = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ recommendation: null });
  }

  const top = items.slice(0, 10).map((i: any, idx: number) =>
    `#${idx + 1} ${i.title} — $${i.price}${i.discountPct ? ` (${i.discountPct}% off)` : ''}${i.marketPrice ? `, market $${i.marketPrice}` : ''}. Condition: ${i.condition}.`
  ).join('\n');

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are a sharp eBay flip advisor. Given these listings, recommend the single best one to buy today for resale profit. Be direct, specific, and under 50 words. No disclaimers.\n\n${top}`,
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null;
    return NextResponse.json({ recommendation: text });
  } catch {
    return NextResponse.json({ recommendation: null });
  }
}
