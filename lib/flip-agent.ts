import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { searchSoldComps } from './ebay-comps';
import { searchStockX } from './stockx';
import { searchMercariSold } from './mercari';
import { searchAmazonPrice } from './amazon';
import { assessDiscountQuality } from './fake-discount';
import { extractModelQuery } from './extract-model';
import { getMultiSourceComps } from './multi-source-comps';
import { r2Get, r2Put } from './r2';
import { createHash } from 'crypto';

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
  multiSourceConfidence?: 'high' | 'medium' | 'low';
  stockxLastSale?: number | null;
  mercariAvgSold?: number | null;
  amazonPrice?: number | null;
  discountQuality?: 'verified' | 'suspicious' | 'inflated' | 'unknown';
  discountQualityReason?: string | null;
  sourcesCount?: number | null;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export function flipCacheKey(title: string, price: number): string {
  const hash = createHash('sha256').update(`${title.toLowerCase().trim()}:${Math.round(price)}`).digest('hex').slice(0, 16);
  return `deal-wiz/comps-cache/${hash}.json`;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeFlip(
  title: string,
  price: number,
  shipping = 0,
  marketPrice?: number | null,
  discountPct?: number | null,
  condition?: string | null,
): Promise<CompsVerdict | null> {
  // Cache check
  try {
    const cached = await r2Get<CompsVerdict & { cachedAt: string }>(flipCacheKey(title, price));
    if (cached?.cachedAt && Date.now() - new Date(cached.cachedAt).getTime() < CACHE_TTL_MS) {
      const { cachedAt: _, ...verdict } = cached;
      return verdict;
    }
  } catch { /* cache miss */ }

  const isSneakerOrCollectible = /jordan|nike|adidas|yeezy|dunk|sneaker|pokemon|card|lego|comic|figure|funko/i.test(title);
  const shortQuery = extractModelQuery(title);
  const [stockxResult, mercariResult, amazonResult] = await Promise.allSettled([
    isSneakerOrCollectible ? searchStockX(shortQuery) : Promise.resolve(null),
    searchMercariSold(shortQuery, 10),
    searchAmazonPrice(shortQuery),
  ]);

  const stockxData = stockxResult.status === 'fulfilled' ? stockxResult.value : null;
  const mercariData = mercariResult.status === 'fulfilled' ? mercariResult.value : null;
  const amazonData = amazonResult.status === 'fulfilled' ? amazonResult.value : null;

  const extraContext = [
    stockxData?.lastSalePrice ? `StockX last sale: $${stockxData.lastSalePrice}${stockxData.lowestAsk ? `, lowest ask: $${stockxData.lowestAsk}` : ''}` : null,
    mercariData?.avgSoldPrice ? `Mercari avg sold: $${mercariData.avgSoldPrice} (${mercariData.soldCount} sales, range $${mercariData.minPrice}–$${mercariData.maxPrice})` : null,
    amazonData?.lowestPrice ? `Amazon current price: $${amazonData.lowestPrice}${amazonData.highestPrice && amazonData.highestPrice !== amazonData.lowestPrice ? `–$${amazonData.highestPrice}` : ''}` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are a resale market analyst. Determine if an eBay listing is worth buying for resale profit.

Item: "${title}"
Listed price: $${price.toFixed(2)}
Shipping cost: $${shipping.toFixed(2)}
Condition: ${condition || 'Unknown'}
${extraContext ? `\nAdditional market data:\n${extraContext}` : ''}

Use search_sold_comps to find eBay sold comps. Run 1–2 searches (broaden only if first returns <5 results).

IMPORTANT — condition matching: The listing condition is "${condition || 'Unknown'}". When computing avgSoldPrice:
- Weight eBay comps that match this condition at 2x versus mismatched conditions.
- Amazon and StockX prices represent NEW condition only. If the listing is Used/Pre-Owned, treat Amazon/StockX as a ceiling reference, not a blend — do not average them in directly.
- Mercari data may be mixed condition; discount its weight by 50% if the listing is Used/Pre-Owned.
- If the item is Used/Pre-Owned, do not let New-condition comps inflate your avg sold price estimate.
- Note any significant condition mix in reasoning.

After searching, respond with ONLY a JSON object:
{
  "verdict": "buy" | "skip" | "maybe",
  "avgSoldPrice": <number — weighted avg: eBay 50%, Amazon 20%, StockX 15%, Mercari 15%. If Amazon >15% below eBay avg, use as ceiling cap. Drop missing sources, rebalance weights. eBay always required.>,
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

multiSourceConfidence: "high" = eBay 5+ comps + 2 other sources within 30%; "medium" = eBay 3+ + 1 source or 30–40% diverge; "low" = eBay-only or <3 comps or >40% conflict.

Verdict rules:
- "buy" if net profit > $50 OR (net profit > $30 AND margin > 20%) AND daysToSell ≤ 30
- "maybe" if profitable but daysToSell 31–60, OR marginal profit with fast sale
- "skip" if net profit < $10 OR (net profit < $20 AND margin < 10%) OR daysToSell > 60
- Never "skip" if net profit > $40 AND daysToSell ≤ 60
- daysToSell: compute from soldDate spread (oldest to newest ÷ count-1). null if <2 dated comps.
- If listing >40% below comps avg, verdict "buy" if profit supports it; note "⚠ verify listing authenticity" in reasoning.

Net profit = (avgSoldPrice × 0.85) − buyPrice − shippingCost
Margin % = netProfit / buyPrice × 100

Platform: "facebook" if bulky or price < $30; "ebay" if electronics/collectibles or profit > $100; "either" otherwise.`;

  const tools: Anthropic.Tool[] = [{
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
  }];

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
    if (start === -1 || end === -1) return null;

    const verdict: CompsVerdict = JSON.parse(finalText.slice(start, end + 1));

    // Override if math contradicts verdict
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

    const dts = verdict.daysToSell ?? null;
    if (dts != null && dts > 60) {
      verdict.verdict = 'skip';
      verdict.reasoning = `${verdict.reasoning} — avg ${dts}d to sell exceeds 60-day hold limit.`.slice(0, 180);
    } else if (dts != null && dts > 30 && verdict.verdict === 'buy') {
      verdict.verdict = 'maybe';
      verdict.reasoning = `${verdict.reasoning} — avg ${dts}d to sell is slow; downgraded to MAYBE.`.slice(0, 180);
    }

    verdict.stockxLastSale = stockxData?.lastSalePrice ?? null;
    verdict.mercariAvgSold = mercariData?.avgSoldPrice ?? null;
    verdict.amazonPrice = amazonData?.lowestPrice ?? null;
    verdict.sourcesCount = 1
      + (verdict.stockxLastSale ? 1 : 0)
      + (verdict.mercariAvgSold ? 1 : 0)
      + (verdict.amazonPrice ? 1 : 0);

    const dq = assessDiscountQuality(
      { price, marketPrice: marketPrice ?? null, discountPct: discountPct ?? null, title } as any,
      verdict.avgSoldPrice,
    );
    verdict.discountQuality = dq.quality;
    verdict.discountQualityReason = dq.reason;

    try {
      await r2Put(flipCacheKey(title, price), JSON.stringify({ ...verdict, cachedAt: new Date().toISOString() }));
    } catch { /* non-fatal */ }

    return verdict;

  } catch (err: any) {
    console.error('[flip-agent] AI error, falling back to multi-source:', err.status, err.message);
    try {
      const comps = await getMultiSourceComps(title, 12);
      if (!comps || comps.ebayCount < 2) return null;

      const netProfit = Math.round(comps.weightedAvgSoldPrice * 0.85 - price - shipping);
      const marginPct = Math.round((netProfit / price) * 100);
      const days = comps.estDaysToSell ?? null;
      const annROI = days != null && days >= 1 && netProfit > 0
        ? Math.round((netProfit / price / days) * 365 * 100) : null;

      let verdict: 'buy' | 'maybe' | 'skip';
      if (netProfit > 50 || (netProfit > 30 && marginPct > 20)) verdict = 'buy';
      else if (netProfit < 10 || (netProfit < 20 && marginPct < 10)) verdict = 'skip';
      else verdict = 'maybe';
      if (netProfit >= 40 && verdict === 'skip') verdict = 'maybe';
      if (days != null && days > 60) verdict = 'skip';
      else if (days != null && days > 30 && verdict === 'buy') verdict = 'maybe';

      const reasoningParts = [
        `Avg sold $${Math.round(comps.weightedAvgSoldPrice)} across ${comps.ebayCount} eBay comps`,
        netProfit > 0 ? `nets +$${netProfit} profit at ${marginPct}% margin` : `only $${netProfit} net — thin margin`,
        days != null ? `est. ${days}d to sell` : null,
        comps.sourcesUsed.length > 1 ? `${comps.sourcesUsed.length} sources agree` : null,
      ].filter(Boolean);

      const fallback: CompsVerdict = {
        verdict,
        avgSoldPrice: comps.weightedAvgSoldPrice,
        soldCount: comps.ebayCount,
        netProfit,
        marginPct,
        reasoning: reasoningParts.join('; '),
        searchQuery: comps.modelQuery,
        daysToSell: days ?? undefined,
        capitalEfficiency: annROI ?? undefined,
        multiSourceConfidence: comps.confidence,
        sourcesCount: comps.sourcesUsed.length,
        stockxLastSale: null,
        mercariAvgSold: null,
        amazonPrice: null,
      };

      const dq = assessDiscountQuality(
        { price, marketPrice: null, discountPct: null, title } as any,
        fallback.avgSoldPrice,
      );
      fallback.discountQuality = dq.quality;
      fallback.discountQualityReason = dq.reason;

      return fallback;
    } catch {
      return null;
    }
  }
}
