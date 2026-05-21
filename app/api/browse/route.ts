import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { searchSoldComps } from '@/lib/ebay-comps';
import { topDeals } from '@/lib/deal-score';
import { r2Get, r2Put } from '@/lib/r2';
import { getDeals, getUserPrefs } from '@/lib/tracker-data';
import { inferCategoriesFromDeals, inferCategoryScores, categoryKeyForTitle } from '@/lib/infer-categories';
import { fetchEbayOrderTitles } from '@/lib/ebay-orders';
import { fetchEbayBuyingActivity } from '@/lib/ebay-watchlist';
import { recordWatcherSnapshots, getWatcherVelocities, WatcherVelocity } from '@/lib/watcher-trends';
import { assessDiscountQuality } from '@/lib/fake-discount';
import { getMultiSourceComps } from '@/lib/multi-source-comps';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BROWSE_CACHE_KEY = 'deal-wiz/browse-cache.json';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface BrowseDeal extends EbayItem {
  flipVerdict: 'buy' | 'maybe';
  avgSoldPrice: number;
  soldCount: number;
  flipNetProfit: number;
  flipMarginPct: number;
  estDaysToSell?: number | null;
  sourcesCount?: number | null;
  multiSourceConfidence?: 'high' | 'medium' | 'low';
  watcherVelocity?: WatcherVelocity | null;
  discountQuality?: 'verified' | 'suspicious' | 'inflated' | 'unknown';
  discountQualityReason?: string | null;
  pickReason?: string | null;
}

interface BrowseCache {
  items: BrowseDeal[];
  generatedAt: string;
}

// Categories with highest resale liquidity — ordered by demand (kept small to stay within eBay rate limits)
const BROWSE_CATEGORIES = [
  'iPhone unlocked used',
  'MacBook Air used',
  'Nintendo Switch OLED',
  'AirPods Pro',
  'Air Jordan sneakers new',
  'PS5 console',
  'Pokemon card PSA 10',
  'Samsung Galaxy unlocked used',
];

async function quickFlipVerdict(item: EbayItem): Promise<{
  verdict: 'buy' | 'maybe' | 'skip';
  netProfit: number;
  avgSoldPrice: number;
  soldCount: number;
  marginPct: number;
  estDaysToSell: number | null;
  sourcesCount: number;
  confidence: 'high' | 'medium' | 'low';
} | null> {
  try {
    const comps = await getMultiSourceComps(item.title, 12);
    if (!comps || comps.ebayCount < 3) return null;

    const netProfit = Math.round(comps.weightedAvgSoldPrice * 0.85 - item.price - (item.shippingCost ?? 0));
    const marginPct = Math.round((netProfit / item.price) * 100);

    let verdict: 'buy' | 'maybe' | 'skip';
    if (netProfit > 50 || (netProfit > 30 && marginPct > 20)) verdict = 'buy';
    else if (netProfit < 10 || (netProfit < 20 && marginPct < 10)) verdict = 'skip';
    else verdict = 'maybe';

    // Never skip strong absolute profit
    if (netProfit >= 40 && verdict === 'skip') verdict = 'maybe';

    // Days-to-sell overrides: >60d = skip (capital tied up too long), >30d = downgrade buy→maybe
    const days = comps.estDaysToSell;
    if (days != null && days > 60) verdict = 'skip';
    else if (days != null && days > 30 && verdict === 'buy') verdict = 'maybe';

    // Today's Picks promises "confirmed" flips — downgrade low/medium confidence buys to maybe
    if (verdict === 'buy' && comps.confidence !== 'high') verdict = 'maybe';

    return { verdict, netProfit, avgSoldPrice: comps.weightedAvgSoldPrice, soldCount: comps.ebayCount, marginPct, estDaysToSell: comps.estDaysToSell, sourcesCount: comps.sourcesUsed.length, confidence: comps.confidence };
  } catch {
    return null;
  }
}

function pickReason(
  key: string | null,
  score: number,
  explicitSet: Set<string>,
  ebayWonKeys: Set<string>,
  ebayWatchKeys: Set<string>,
): string | null {
  if (!key || score === 0) return null;
  if (explicitSet.has(key)) return '★ Matches your preferences';
  if (ebayWonKeys.has(key)) return '🛍 You buy this category on eBay';
  if (ebayWatchKeys.has(key)) return '👀 In your eBay watch list';
  return null;
}

function personalizeResults(
  items: BrowseDeal[],
  categoryScores: Map<string, number>,
  explicitCategories: string[],
  ebayWonTitles: string[],
  ebayWatchedTitles: string[],
): BrowseDeal[] {
  const explicitSet = new Set(explicitCategories);
  const ebayWonKeys = new Set(ebayWonTitles.map(t => categoryKeyForTitle(t)).filter(Boolean) as string[]);
  const ebayWatchKeys = new Set(ebayWatchedTitles.map(t => categoryKeyForTitle(t)).filter(Boolean) as string[]);

  return [...items]
    .map(item => {
      const key = categoryKeyForTitle(item.title);
      const score = key ? (categoryScores.get(key) ?? 0) : 0;
      return { ...item, pickReason: pickReason(key, score, explicitSet, ebayWonKeys, ebayWatchKeys) };
    })
    .sort((a, b) => {
      const aKey = categoryKeyForTitle(a.title);
      const bKey = categoryKeyForTitle(b.title);
      const aScore = aKey ? (categoryScores.get(aKey) ?? 0) : 0;
      const bScore = bKey ? (categoryScores.get(bKey) ?? 0) : 0;
      if (bScore !== aScore) return bScore - aScore;
      if (a.flipVerdict !== b.flipVerdict) return a.flipVerdict === 'buy' ? -1 : 1;
      return b.flipNetProfit - a.flipNetProfit;
    });
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

  // Load all personalization signals in parallel
  const [userDeals, userPrefs, ebayTitles, ebayActivity] = await Promise.allSettled([
    getDeals(session.userId),
    getUserPrefs(session.userId),
    fetchEbayOrderTitles(session.userId),
    fetchEbayBuyingActivity(session.userId),
  ]);
  const deals = userDeals.status === 'fulfilled' ? userDeals.value : [];
  const prefs = userPrefs.status === 'fulfilled' ? userPrefs.value : {};
  const orderTitles = ebayTitles.status === 'fulfilled' ? ebayTitles.value : [];
  const buying = ebayActivity.status === 'fulfilled' ? ebayActivity.value : { watchedTitles: [], wonTitles: [] };

  // Merge won titles from both sources (buy order API + trading API)
  const wonSet = new Set(orderTitles);
  buying.wonTitles.forEach(t => wonSet.add(t));
  const allWonTitles = Array.from(wonSet);

  const explicitCategories = (prefs as any).digestCategories ?? [];

  // Weighted scores: explicit=1.0, won/purchased=0.7, watched=0.5, tracker=0.3 (stacked, capped at 1.0)
  const categoryScores = inferCategoryScores(explicitCategories, buying.watchedTitles, allWonTitles, deals);

  // For response metadata
  const allEbayTitles = [...allWonTitles, ...buying.watchedTitles];
  const inferredCategories = allEbayTitles.length > 0
    ? inferCategoriesFromDeals(allEbayTitles.map(t => ({ title: t, category: '' } as any)))
    : inferCategoriesFromDeals(deals);

  const maxDays = prefs && (prefs as any).maxDaysToSell != null ? (prefs as any).maxDaysToSell as number : 60;

  // Serve from cache if fresh — personalize order before returning
  const cached = await r2Get<BrowseCache>(BROWSE_CACHE_KEY);
  const cacheHasItems = cached && cached.generatedAt && cached.items.length > 0;

  const serveCache = (stale = false) => {
    let items = personalizeResults(cached!.items, categoryScores, explicitCategories, allWonTitles, buying.watchedTitles);
    items = items.filter(i => i.estDaysToSell == null || i.estDaysToSell <= maxDays);
    const matchedFromEbay = items.filter(i => {
      const key = categoryKeyForTitle(i.title);
      return key && (buying.watchedTitles.length > 0 || allWonTitles.length > 0) && categoryScores.get(key) !== undefined;
    }).length;
    return NextResponse.json({ ...cached, items, fromCache: true, stale, inferredCategories: inferredCategories.length > 0 ? inferredCategories : undefined, personalizationDebug: { watchedCount: buying.watchedTitles.length, wonCount: allWonTitles.length, picksInfluenced: matchedFromEbay } });
  };

  if (!forceRefresh && cacheHasItems) {
    const age = Date.now() - new Date(cached!.generatedAt).getTime();
    if (age < CACHE_TTL_MS) return serveCache();
  }

  if (!process.env.EBAY_CLIENT_ID) {
    return NextResponse.json({ error: 'eBay API not configured' }, { status: 503 });
  }

  try {
    // Fetch all categories in parallel
    const searchResults = await Promise.allSettled(
      BROWSE_CATEGORIES.map(q => searchDeals(q, 30))
    );

    const allItems: EbayItem[] = [];
    const seen = new Set<string>();
    searchResults.forEach(r => {
      if (r.status === 'fulfilled') {
        r.value.forEach(item => {
          if (!seen.has(item.itemId)) { seen.add(item.itemId); allItems.push(item); }
        });
      }
    });

    // Score and pick top 12 candidates (fewer comps calls = fewer eBay API hits)
    const candidates = topDeals(allItems, 12, 50);
    if (candidates.length === 0) {
      // All eBay searches failed or returned nothing — serve stale cache if available
      if (cacheHasItems) return serveCache(true);
      return NextResponse.json({ items: [], generatedAt: new Date().toISOString(), fromCache: false });
    }

    // Run sold comps on all candidates in parallel
    const flipResults = await Promise.allSettled(candidates.map(item => quickFlipVerdict(item)));

    const browsed: BrowseDeal[] = [];
    candidates.forEach((item, i) => {
      const r = flipResults[i];
      if (r.status !== 'fulfilled' || !r.value || r.value.verdict === 'skip') return;
      browsed.push({
        ...item,
        flipVerdict: r.value.verdict,
        avgSoldPrice: r.value.avgSoldPrice,
        soldCount: r.value.soldCount,
        flipNetProfit: r.value.netProfit,
        flipMarginPct: r.value.marginPct,
        estDaysToSell: r.value.estDaysToSell,
        sourcesCount: r.value.sourcesCount ?? null,
        multiSourceConfidence: r.value.confidence,
      });
    });

    // Record watcher snapshots for all candidates (for velocity tracking)
    await recordWatcherSnapshots(candidates.map(i => ({ itemId: i.itemId, watchCount: (i as any).watchCount ?? null })));

    // Fetch watcher velocities for all browsed items
    const velocities = await getWatcherVelocities(browsed.map(i => i.itemId));

    // Attach watcher velocity + discount quality to each item
    browsed.forEach(deal => {
      deal.watcherVelocity = velocities[deal.itemId] ?? null;
      const dq = assessDiscountQuality(deal, deal.avgSoldPrice);
      deal.discountQuality = dq.quality;
      deal.discountQualityReason = dq.reason;
    });

    // Apply user's maxDaysToSell preference — N/A (null) always passes through
    const filteredBrowsed = browsed.filter(i => i.estDaysToSell == null || i.estDaysToSell <= maxDays);

    // BUY first, then MAYBE; within each group: hot watcher velocity first, then net profit
    filteredBrowsed.sort((a, b) => {
      if (a.flipVerdict !== b.flipVerdict) return a.flipVerdict === 'buy' ? -1 : 1;
      const aHot = a.watcherVelocity?.velocityLabel === 'hot' ? 1 : 0;
      const bHot = b.watcherVelocity?.velocityLabel === 'hot' ? 1 : 0;
      if (aHot !== bHot) return bHot - aHot;
      return b.flipNetProfit - a.flipNetProfit;
    });

    const result: BrowseCache = {
      items: filteredBrowsed.slice(0, 15),
      generatedAt: new Date().toISOString(),
    };

    await r2Put(BROWSE_CACHE_KEY, JSON.stringify(result));
    const personalizedItems = personalizeResults(result.items, categoryScores, explicitCategories, allWonTitles, buying.watchedTitles);
    const matchedFromEbay = personalizedItems.filter(i => {
      const key = categoryKeyForTitle(i.title);
      return key && (buying.watchedTitles.length > 0 || allWonTitles.length > 0) && categoryScores.get(key) !== undefined;
    }).length;
    return NextResponse.json({ ...result, items: personalizedItems, fromCache: false, inferredCategories: inferredCategories.length > 0 ? inferredCategories : undefined, personalizationDebug: { watchedCount: buying.watchedTitles.length, wonCount: allWonTitles.length, picksInfluenced: matchedFromEbay } });

  } catch (err: any) {
    // eBay rate limited — serve stale cache if available rather than returning an error
    if (cacheHasItems && (String(err).includes('Too many requests') || String(err).includes('2001') || String(err).includes('rate'))) {
      return serveCache(true);
    }
    return NextResponse.json({ error: err.message || 'Browse failed' }, { status: 500 });
  }
}
