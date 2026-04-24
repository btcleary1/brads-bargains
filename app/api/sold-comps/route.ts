import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchSoldComps } from '@/lib/ebay-comps';
import { checkRequestLimit } from '@/lib/rate-limit';
import { searchStockX } from '@/lib/stockx';
import { searchMercariSold } from '@/lib/mercari';
import { searchAmazonPrice } from '@/lib/amazon';
import { assessDiscountQuality } from '@/lib/fake-discount';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CompsVerdict {
  verdict: 'buy' | 'skip' | 'maybe';
  avgSoldPrice: number;
  soldCount: number;
  netProfit: number;
  marginPct: number;
  reasoning: string;
  searchQuery: string;
  daysToSell?: number;
  capitalEfficiency?: number;
  platformRecommendation?: 'ebay' | 'facebook' | 'either';
  // Multi-source confidence
  multiSourceConfidence?: 'high' | 'medium' | 'low';
  stockxLastSale?: number | null;
  mercariAvgSold?: number | null;
  amazonPrice?: number | null;
  discountQuality?: 'verified' | 'suspicious' | 'inflated' | 'unknown';
  discountQualityReason?: string | null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try { await checkRequestLimit(session.userId, 'sold-comps', 30, 60_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  const { title, price, shippingCost, marketPrice, discountPct } = await req.json();
  if (!title || typeof price !== 'number') {
    return NextResponse.json({ error: 'title and price required' }, { status: 400 });
  }

  const shipping = shippingCost ?? 0;

  // Fire StockX + Mercari searches in parallel while agent runs eBay comps
  const isSneakerOrCollectible = /jordan|nike|adidas|yeezy|dunk|sneaker|pokemon|card|lego|comic|figure|funko/i.test(title);
  const shortQuery = title.split(' ').slice(0, 6).join(' ');
  const [stockxResult, mercariResult, amazonResult] = await Promise.allSettled([
    isSneakerOrCollectible ? searchStockX(shortQuery) : Promise.resolve(null),
    searchMercariSold(shortQuery, 10),
    searchAmazonPrice(shortQuery),
  ]);

  const stockxData = stockxResult.status === 'fulfilled' ? stockxResult.value : null;
  const mercariData = mercariResult.status === 'fulfilled' ? mercariResult.value : null;
  const amazonData = amazonResult.status === 'fulfilled' ? amazonResult.value : null;

  // Build extra context for the agent if we have additional data
  const extraContext = [
    stockxData?.lastSalePrice ? `StockX last sale: $${stockxData.lastSalePrice}${stockxData.lowestAsk ? `, lowest ask: $${stockxData.lowestAsk}` : ''}` : null,
    mercariData?.avgSoldPrice ? `Mercari avg sold: $${mercariData.avgSoldPrice} (${mercariData.soldCount} sales, range $${mercariData.minPrice}–$${mercariData.maxPrice})` : null,
    amazonData?.lowestPrice ? `Amazon current price: $${amazonData.lowestPrice}${amazonData.highestPrice && amazonData.highestPrice !== amazonData.lowestPrice ? `–$${amazonData.highestPrice}` : ''}` : null,
  ].filter(Boolean).join('\n');

  const tools: Anthropic.Tool[] = [
    {
      name: 'search_sold_comps',
      description: 'Search eBay sold listings to find what this item actually sold for recently.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Specific model/condition search terms.' },
          max_results: { type: 'number', description: 'Max results (5–20)', default: 15 },
        },
        required: ['query'],
      },
    },
  ];

  const systemPrompt = `You are a resale market analyst. Determine if an eBay listing is worth buying for resale profit.

Item: "${title}"
Listed price: $${price.toFixed(2)}
Shipping cost: $${shipping.toFixed(2)}
${extraContext ? `\nAdditional market data:\n${extraContext}` : ''}

Use search_sold_comps to find eBay sold comps. Run 1–2 searches (broaden only if first returns <5 results).

After searching, respond with ONLY a JSON object:
{
  "verdict": "buy" | "skip" | "maybe",
  "avgSoldPrice": <number — weighted avg: eBay 60%, StockX 25%, Mercari 15% if available, else eBay only>,
  "soldCount": <number>,
  "netProfit": <number>,
  "marginPct": <number>,
  "reasoning": "<one sentence, max 120 chars — mention if multiple sources agree>",
  "searchQuery": "<best query used>",
  "daysToSell": <number or null>,
  "capitalEfficiency": <number or null — annualized ROI, cap at 2000>,
  "platformRecommendation": "ebay" | "facebook" | "either",
  "multiSourceConfidence": "high" | "medium" | "low"
}

multiSourceConfidence rules:
- "high": eBay comps + at least 2 other sources (StockX/Mercari/Amazon) all agree within 20% of each other
- "medium": eBay comps + 1 other source agree, or sources diverge 20–40%
- "low": eBay-only or sources conflict by >40% or fewer than 3 eBay comps

If Amazon price is available and lower than eBay sell price: note in reasoning that buyer can get it on Amazon for less — may affect resale demand.

Verdict rules — follow strictly based on net profit math, do NOT override based on suspicion:
- "buy" if net profit > $50 OR (net profit > $30 AND margin > 20%)
- "skip" if net profit < $10 OR (net profit < $20 AND margin < 10%)
- "maybe" otherwise
- Never "skip" if net profit > $40

IMPORTANT: If listing price is far below comps (>40% under avg sold), that is a GREAT flip opportunity — verdict should be "buy" if profit math supports it. Note "⚠ verify listing authenticity" in reasoning since deep discounts can indicate scam listings, but still return the correct profit-based verdict. Never return "skip" just because a listing seems too cheap.

Net profit = (avgSoldPrice × 0.85) − buyPrice − shippingCost
Margin % = netProfit / buyPrice × 100

Platform recommendation:
- "facebook" if large/bulky or price < $30
- "ebay" if electronics, collectibles, or net profit > $100
- "either" otherwise`;

  const messages: MessageParam[] = [{ role: 'user', content: 'Analyze this deal.' }];

  try {
    let finalText = '';

    for (let i = 0; i < 5; i++) {
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        tools,
        messages,
      });

      messages.push({ role: 'assistant', content: res.content });

      if (res.stop_reason === 'end_turn') {
        const textBlock = res.content.find(b => b.type === 'text');
        if (textBlock && textBlock.type === 'text') finalText = textBlock.text;
        break;
      }

      if (res.stop_reason !== 'tool_use') break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        let result = '';
        try {
          if (block.name === 'search_sold_comps') {
            const input = block.input as { query: string; max_results?: number };
            const compsData = await searchSoldComps(input.query, input.max_results ?? 15);
            result = JSON.stringify({
              count: compsData.count,
              avgSoldPrice: compsData.avgSoldPrice,
              medianSoldPrice: compsData.medianSoldPrice,
              minSoldPrice: compsData.minSoldPrice,
              maxSoldPrice: compsData.maxSoldPrice,
              recentSales: compsData.comps.slice(0, 8).map(c => ({
                title: c.title.slice(0, 60),
                price: c.soldPrice,
                condition: c.condition,
                soldDate: c.soldDate,
              })),
            });
          }
        } catch {
          result = JSON.stringify({ error: 'Search failed', count: 0 });
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    const start = finalText.indexOf('{');
    const end = finalText.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'Could not parse agent response' }, { status: 500 });
    }

    const verdict: CompsVerdict = JSON.parse(finalText.slice(start, end + 1));

    // Override agent verdict if math clearly contradicts it
    const computedProfit = Math.round(verdict.avgSoldPrice * 0.85 - price - shipping);
    const computedMargin = Math.round((computedProfit / price) * 100);
    if (verdict.verdict === 'skip' && computedProfit >= 40) {
      verdict.verdict = computedProfit > 50 || (computedProfit > 30 && computedMargin > 20) ? 'buy' : 'maybe';
      verdict.netProfit = computedProfit;
      verdict.marginPct = computedMargin;
      if (verdict.avgSoldPrice > price * 1.4) {
        verdict.reasoning = `⚠ Verify listing authenticity — price is far below comps, but profit math is strong if real.`;
      }
    }

    // Attach multi-source prices + discount quality assessment
    verdict.stockxLastSale = stockxData?.lastSalePrice ?? null;
    verdict.mercariAvgSold = mercariData?.avgSoldPrice ?? null;
    verdict.amazonPrice = amazonData?.lowestPrice ?? null;

    const dq = assessDiscountQuality(
      { price, marketPrice: marketPrice ?? null, discountPct: discountPct ?? null, title } as any,
      verdict.avgSoldPrice,
    );
    verdict.discountQuality = dq.quality;
    verdict.discountQualityReason = dq.reason;

    return NextResponse.json(verdict);

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Agent failed' }, { status: 500 });
  }
}
