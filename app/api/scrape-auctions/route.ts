import { NextRequest, NextResponse } from 'next/server';
import { fetchMacBidDeals } from '@/lib/macbid';
import { fetchVistaAuctionDeals } from '@/lib/vista-auction';
import { getMultiSourceComps } from '@/lib/multi-source-comps';
import { r2Get, r2Put } from '@/lib/r2';
import { EbayItem } from '@/lib/ebay';
import { computeVerdict, MIN_SOLD_COMPS } from '@/lib/flip-verdict';

export const runtime = 'nodejs';
export const maxDuration = 120;

const AUCTION_CACHE_KEY = 'deal-wiz/auction-deals.json';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface AuctionDeal extends EbayItem {
  flipNetProfit: number;
  flipVerdict: 'buy' | 'maybe';
  avgSoldPrice: number;
  soldCount: number;
  flipMarginPct: number;
  estDaysToSell: number | null;
  sourcesCount: number | null;
  stockxLastSale: number | null;
  mercariAvgSold: number | null;
  amazonPrice: number | null;
  auctionSource: 'macbid' | 'vista';
}

interface AuctionCache {
  generatedAt: string;
  items: AuctionDeal[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!(process.env.SCRAPE_SECRET ?? '') || secret !== (process.env.SCRAPE_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';

  try {
    // Rate-limit: skip if cache is less than 4 hours old
    if (!force) {
      const existing = await r2Get<AuctionCache>(AUCTION_CACHE_KEY);
      if (existing?.generatedAt) {
        const age = Date.now() - new Date(existing.generatedAt).getTime();
        if (age < CACHE_TTL_MS) {
          console.log(`[scrape-auctions] Cache is fresh (${Math.round(age / 60000)}m old), skipping. Use ?force=1 to override.`);
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: 'cache_fresh',
            cacheAge: Math.round(age / 60000),
            generatedAt: existing.generatedAt,
          });
        }
      }
    }

    // Step 1: Run both scrapers in parallel
    console.log('[scrape-auctions] Fetching macbid and vista auction deals in parallel...');
    const [macbidRaw, vistaRaw] = await Promise.all([
      fetchMacBidDeals(),
      fetchVistaAuctionDeals(),
    ]);
    console.log(`[scrape-auctions] macbid: ${macbidRaw.length} items, vista: ${vistaRaw.length} items`);

    // Step 2: Deduplicate by itemId and combine
    const seen = new Set<string>();
    const combined: (EbayItem & { auctionSource: 'macbid' | 'vista' })[] = [];
    for (const item of macbidRaw) {
      if (!seen.has(item.itemId)) {
        seen.add(item.itemId);
        combined.push({ ...item, auctionSource: 'macbid' });
      }
    }
    for (const item of vistaRaw) {
      if (!seen.has(item.itemId)) {
        seen.add(item.itemId);
        combined.push({ ...item, auctionSource: 'vista' });
      }
    }
    console.log(`[scrape-auctions] Combined (deduped): ${combined.length} items`);

    // Step 3: Filter to items where price > 0
    const priced = combined.filter(item => item.price > 0);
    console.log(`[scrape-auctions] After price > 0 filter: ${priced.length} items`);

    // Step 4: Run getMultiSourceComps in batches of 5 with 300ms delay between batches
    const BATCH_SIZE = 5;
    const qualifiedItems: AuctionDeal[] = [];

    for (let i = 0; i < priced.length; i += BATCH_SIZE) {
      const batch = priced.slice(i, i + BATCH_SIZE);
      console.log(`[scrape-auctions] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(priced.length / BATCH_SIZE)} (items ${i + 1}-${Math.min(i + BATCH_SIZE, priced.length)})`);

      const batchResults = await Promise.allSettled(
        batch.map(item => getMultiSourceComps(item.title, 12, item.condition))
      );

      batchResults.forEach((result, idx) => {
        const item = batch[idx];
        if (result.status !== 'fulfilled' || !result.value) {
          console.log(`[scrape-auctions] No comps for: ${item.title.slice(0, 60)}`);
          return;
        }

        const compResult = result.value;
        // These verdicts are seeded straight into the digest without re-running comps,
        // so they must clear the same comp-count bar as everything else.
        if (compResult.ebayCount < MIN_SOLD_COMPS) {
          console.log(`[scrape-auctions] Insufficient comps (${compResult.ebayCount}) for: ${item.title.slice(0, 60)}`);
          return;
        }

        const netProfit = Math.round(
          compResult.weightedAvgSoldPrice * 0.85 - item.price - (item.shippingCost ?? 0)
        );
        const marginPct = item.price > 0 ? Math.round((netProfit / item.price) * 100) : 0;

        // Filter: netProfit must be >= 15
        if (netProfit < 15) {
          console.log(`[scrape-auctions] Low profit ($${netProfit}) skipping: ${item.title.slice(0, 60)}`);
          return;
        }

        // Filter: estDaysToSell must be <= 20 (null passes through)
        const days = compResult.estDaysToSell;
        if (days != null && days > 20) {
          console.log(`[scrape-auctions] Too slow to sell (${days}d) skipping: ${item.title.slice(0, 60)}`);
          return;
        }

        const verdict = computeVerdict({ netProfit, marginPct, soldCount: compResult.ebayCount, daysToSell: days });
        if (verdict === 'skip') {
          console.log(`[scrape-auctions] Verdict skip, dropping: ${item.title.slice(0, 60)}`);
          return;
        }
        const flipVerdict: 'buy' | 'maybe' = verdict;

        console.log(`[scrape-auctions] Qualified: ${item.title.slice(0, 60)} — $${netProfit} profit, ${flipVerdict}`);

        qualifiedItems.push({
          ...item,
          flipNetProfit: netProfit,
          flipVerdict,
          avgSoldPrice: compResult.weightedAvgSoldPrice,
          soldCount: compResult.ebayCount,
          flipMarginPct: marginPct,
          estDaysToSell: compResult.estDaysToSell,
          sourcesCount: compResult.sourcesUsed.length,
          stockxLastSale: compResult.stockxLastSale ?? null,
          mercariAvgSold: compResult.mercariAvg ?? null,
          amazonPrice: compResult.amazonPrice ?? null,
        });
      });

      // Delay between batches (skip delay after last batch)
      if (i + BATCH_SIZE < priced.length) {
        await sleep(300);
      }
    }

    console.log(`[scrape-auctions] Qualified items: ${qualifiedItems.length}`);

    // Sort: buy before maybe, then by net profit descending
    qualifiedItems.sort((a, b) => {
      if (a.flipVerdict !== b.flipVerdict) return a.flipVerdict === 'buy' ? -1 : 1;
      return b.flipNetProfit - a.flipNetProfit;
    });

    // Step 5: Save to R2
    const generatedAt = new Date().toISOString();
    const payload: AuctionCache = { generatedAt, items: qualifiedItems };
    await r2Put(AUCTION_CACHE_KEY, JSON.stringify(payload));
    console.log(`[scrape-auctions] Saved ${qualifiedItems.length} qualified items to R2 at ${generatedAt}`);

    return NextResponse.json({
      success: true,
      macbidCount: macbidRaw.length,
      vistaCount: vistaRaw.length,
      qualifiedCount: qualifiedItems.length,
      generatedAt,
    });

  } catch (err) {
    console.error('[scrape-auctions] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
