import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals } from '@/lib/ebay';
import { checkRequestLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 90;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CoachResult {
  diagnosis: string;
  actions: string[];
  priceDropSuggestion: number | null;
  switchPlatform: boolean;
  switchPlatformReason: string | null;
}

async function searchCompetition(query: string): Promise<{ count: number; avgPrice: number; minPrice: number; titles: string[] }> {
  try {
    const items = await searchDeals(query, 20);
    if (items.length === 0) return { count: 0, avgPrice: 0, minPrice: 0, titles: [] };
    const prices = items.map(i => i.price).filter(p => p > 0);
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    return {
      count: items.length,
      avgPrice: Math.round(avg * 100) / 100,
      minPrice: Math.min(...prices),
      titles: items.slice(0, 5).map(i => `${i.title} — $${i.price}`),
    };
  } catch {
    return { count: 0, avgPrice: 0, minPrice: 0, titles: [] };
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try { await checkRequestLimit(session.userId, 'stale-coach', 15, 60_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  const { title, ebayPrice, listedDaysAgo, condition, category } = await req.json();
  if (!title || typeof ebayPrice !== 'number') {
    return NextResponse.json({ error: 'title and ebayPrice required' }, { status: 400 });
  }

  const daysStale = listedDaysAgo ?? 14;

  // Search current eBay competition for context
  const shortQuery = title.split(' ').slice(0, 6).join(' ');
  const competition = await searchCompetition(shortQuery);

  const competitionContext = competition.count > 0
    ? `Current active eBay competition for "${shortQuery}":
- ${competition.count} similar listings active right now
- Average asking price: $${competition.avgPrice}
- Lowest asking price: $${competition.minPrice}
- Top listings: ${competition.titles.join('; ')}`
    : `No active eBay competition found for "${shortQuery}" — market may be thin or query too specific.`;

  const systemPrompt = `You are a resale coach who helps people sell items faster on eBay and Facebook Marketplace.

The user has this item STUCK in their tracker:
- Title: "${title}"
- Their listed price: $${ebayPrice}
- Listed: ${daysStale} days ago without selling
- Condition: ${condition ?? 'Unknown'}
- Category: ${category ?? 'Unknown'}

${competitionContext}

Diagnose why this item isn't selling and give specific, actionable advice. Be direct and honest — if they're overpriced, say so. Respond with ONLY a JSON object:

{
  "diagnosis": "<one sentence root cause — e.g. 'Priced 40% above competition, 8 cheaper alternatives available'>",
  "actions": ["<action 1>", "<action 2>", "<action 3>"],
  "priceDropSuggestion": <number — suggested new price, or null if pricing isn't the issue>,
  "switchPlatform": <true|false — should they try Facebook Marketplace instead?>,
  "switchPlatformReason": "<why switch, or null>"
}

Actions should be specific: exact price points, photo tips, title keywords to add/remove, timing suggestions. Max 3 actions.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'Why is my item not selling? Give me your honest diagnosis.' }] as MessageParam[],
      system: systemPrompt,
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'Could not parse coach response' }, { status: 500 });
    }
    const result: CoachResult = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json(result);

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Coach failed' }, { status: 500 });
  }
}
