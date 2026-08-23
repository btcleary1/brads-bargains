import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { isJunk } from '@/lib/deal-score';
import { computeVerdict } from '@/lib/flip-verdict';
import { r2Get, r2Put } from '@/lib/r2';
import { getDeals, getUserPrefs } from '@/lib/tracker-data';
import { inferCategoriesFromDeals, inferCategoryScores, categoryKeyForTitle } from '@/lib/infer-categories';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';
import { fetchEbayOrderTitles, getEbayAccessToken } from '@/lib/ebay-orders';
import { fetchEbayBuyingActivity } from '@/lib/ebay-watchlist';
import { getEbaySavedSearches } from '@/lib/ebay-user';
import { computeTasteProfile } from '@/lib/user-taste';
import { getFeedback } from '@/lib/deal-feedback';
import { recordWatcherSnapshots, getWatcherVelocities, WatcherVelocity } from '@/lib/watcher-trends';
import { assessDiscountQuality } from '@/lib/fake-discount';
import { getMultiSourceComps } from '@/lib/multi-source-comps';
import { checkItemQuality, isFlippableItem } from '@/lib/item-quality';
import { checkSellersBatch } from '@/lib/seller-quality';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Fixed cache key with TTL — serves yesterday's cache immediately on first login
// so users never see a cold-start spinner. The warm cron (11 AM UTC) regenerates it daily.
const BROWSE_CACHE_KEY = () => `deal-wiz/browse-cache.json`;
const CACHE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours — refreshes daily via cron

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

// Maps broad categoryKeyForTitle keys → DIGEST_CATEGORIES keys covered by BROWSE_CATEGORIES
const BROWSE_COVERED_KEYS = new Set([
  'cell_phones', 'computers', 'video_games', 'consumer_elec', 'clothing', 'sports_cards',
]);

// Maps a broad interest key to the DIGEST_CATEGORIES entry to search for it.
// Previously six of these pointed somewhere unrelated — coins and books_comics both
// searched graded sports cards, music and dvds_movies searched LEGO, and musical_inst
// searched graphics cards — so a coin collector got sports cards in their personalized
// slots. Each of those keys now has a correctly-queried entry of its own, so they map
// to themselves; the rest redirect to the nearest real category.
const INTEREST_CATEGORY_MAP: Record<string, string> = {
  tools_industrial: 'tools_industrial',
  toys_hobbies:     'lego_sealed',
  cameras:          'cameras',
  jewelry_watches:  'jewelry_watches',
  sporting_goods:   'sporting_goods',
  collectibles:     'collectibles',
  coins:            'coins',
  musical_inst:     'musical_inst',
  home_garden:      'home_garden',
  books_comics:     'books_comics',
  music:            'music',
  dvds_movies:      'dvds_movies',
};

// Returns DIGEST_CATEGORIES searches for user interest keys not already in BROWSE_CATEGORIES
function getInterestSearches(categoryScores: Map<string, number>): { query: string; maxPrice?: number }[] {
  const searches: { query: string; maxPrice?: number }[] = [];
  for (const [key, score] of categoryScores.entries()) {
    if (score <= 0 || BROWSE_COVERED_KEYS.has(key)) continue;
    const digestKey = INTEREST_CATEGORY_MAP[key];
    if (!digestKey) continue;
    const cat = DIGEST_CATEGORIES.find(c => c.key === digestKey);
    if (cat) searches.push({ query: cat.query, maxPrice: cat.maxPrice });
  }
  return searches.slice(0, 4);
}

// Categories with price ceilings — search only for listings that could realistically flip for profit.
// maxPrice is set ~20-30% below typical resale so we only evaluate potentially underpriced items.
const BROWSE_CATEGORIES: { query: string; maxPrice?: number }[] = [
  { query: 'iPhone 13 unlocked used',          maxPrice: 220 },
  { query: 'iPhone 14 unlocked used',          maxPrice: 300 },
  { query: 'iPhone 15 unlocked used',          maxPrice: 420 },
  { query: 'MacBook Air M1 used',              maxPrice: 600 },
  { query: 'MacBook Air M2 used',              maxPrice: 750 },
  { query: 'Nintendo Switch OLED used',        maxPrice: 220 },
  { query: 'AirPods Pro 2nd gen',              maxPrice: 150 },
  { query: 'Air Jordan 1 size 10',             maxPrice: 140 },
  { query: 'PS5 console disc used',            maxPrice: 350 },
  { query: 'Pokemon card PSA 10',              maxPrice: 150 },
  { query: 'Samsung Galaxy S23 unlocked used', maxPrice: 280 },
  { query: 'iPad Air used',                    maxPrice: 300 },
];


/**
 * Why an item disappeared from someone's feed. The UI needs this: an empty feed
 * that says "nothing found" when the real answer is "your own lego filter hid the
 * one result" is unactionable, and reads as the app being broken.
 */
export interface HiddenSummary {
  total: number;
  byKeyword: number;
  byDisliked: number;
  byCategory: number;
  keywords: string[];
}

function applyUserFilters<T extends { itemId: string; title: string }>(
  items: T[],
  ctx: {
    dislikedIds: Set<string>;
    blockedKwPatterns: RegExp[];
    blockedKeywords: string[];
    excludedCategories: string[];
  },
): { kept: T[]; hidden: HiddenSummary } {
  const hidden: HiddenSummary = { total: 0, byKeyword: 0, byDisliked: 0, byCategory: 0, keywords: [] };
  const matchedKw = new Set<string>();

  const kept = items.filter(i => {
    if (ctx.dislikedIds.has(i.itemId)) { hidden.total++; hidden.byDisliked++; return false; }
    const kwIdx = ctx.blockedKwPatterns.findIndex(re => re.test(i.title));
    if (kwIdx >= 0) {
      hidden.total++; hidden.byKeyword++;
      if (ctx.blockedKeywords[kwIdx]) matchedKw.add(ctx.blockedKeywords[kwIdx]);
      return false;
    }
    if (ctx.excludedCategories.length > 0) {
      const key = categoryKeyForTitle(i.title);
      if (key && ctx.excludedCategories.includes(key)) { hidden.total++; hidden.byCategory++; return false; }
    }
    return true;
  });

  hidden.keywords = [...matchedKw];
  return { kept, hidden };
}

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
    const quality = await checkItemQuality(item.itemId, item.title);
    if (quality.broken) return null;

    const comps = await getMultiSourceComps(item.title, 12);
    if (!comps || comps.ebayCount < 2) return null;

    // Sanity check: sold avg > 2× listing price means comp query matched wrong items
    if (comps.weightedAvgSoldPrice > item.price * 2) return null;

    const netProfit = Math.round(comps.weightedAvgSoldPrice * 0.85 - item.price - (item.shippingCost ?? 0));
    const marginPct = Math.round((netProfit / item.price) * 100);

    const days = comps.estDaysToSell;
    const verdict = computeVerdict({ netProfit, marginPct, soldCount: comps.ebayCount, daysToSell: days });

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
  const inPrefs   = explicitSet.has(key);
  const inPurchases = ebayWonKeys.has(key);
  const inWatchlist = ebayWatchKeys.has(key);

  if (inPrefs && inPurchases) return '★ In your preferences & purchase history';
  if (inPrefs && inWatchlist) return '★ In your preferences & watch list';
  if (inPrefs)       return '★ Matches your preferences';
  if (inPurchases)   return '🛍 You buy this category on eBay';
  if (inWatchlist)   return '👀 In your eBay watch list';
  return null;
}

function personalizeResults(
  items: BrowseDeal[],
  categoryScores: Map<string, number>,
  tasteWeights: Record<string, number>,
  explicitCategories: string[],
  ebayWonTitles: string[],
  ebayWatchedTitles: string[],
  hasEbayHistory: boolean,
): BrowseDeal[] {
  const explicitSet = new Set(explicitCategories);
  const ebayWonKeys = new Set(ebayWonTitles.map(t => categoryKeyForTitle(t)).filter(Boolean) as string[]);
  const ebayWatchKeys = new Set(ebayWatchedTitles.map(t => categoryKeyForTitle(t)).filter(Boolean) as string[]);

  const scored = [...items].map(item => {
    if (item.pickReason?.startsWith('🔍') || item.pickReason?.startsWith('🛍')) return item;
    const key = categoryKeyForTitle(item.title);
    const score = key ? (categoryScores.get(key) ?? 0) : 0;
    return { ...item, pickReason: pickReason(key, score, explicitSet, ebayWonKeys, ebayWatchKeys) };
  });

  const sorted = scored.sort((a, b) => {
    const aKey = categoryKeyForTitle(a.title);
    const bKey = categoryKeyForTitle(b.title);
    const aScore = aKey ? (categoryScores.get(aKey) ?? 0) : 0;
    const bScore = bKey ? (categoryScores.get(bKey) ?? 0) : 0;
    const aTaste = aKey ? (tasteWeights[aKey] ?? 1.0) : 1.0;
    const bTaste = bKey ? (tasteWeights[bKey] ?? 1.0) : 1.0;
    const aRank = (1 + aScore) * aTaste;
    const bRank = (1 + bScore) * bTaste;
    if (Math.abs(bRank - aRank) > 0.01) return bRank - aRank;
    if (a.flipVerdict !== b.flipVerdict) return a.flipVerdict === 'buy' ? -1 : 1;
    return b.flipNetProfit - a.flipNetProfit;
  });

  // When the user has eBay history, filter out categories they have no affinity for.
  // Saved-search items (🔍) always pass through. Fall back to all items if fewer than 3 match.
  if (hasEbayHistory) {
    const filtered = sorted.filter(item => {
      if (item.pickReason?.startsWith('🔍') || item.pickReason?.startsWith('🛍')) return true;
      const key = categoryKeyForTitle(item.title);
      return key ? (categoryScores.get(key) ?? 0) > 0 : false;
    });
    if (filtered.length >= 3) return filtered;
  }

  return sorted;
}

export async function GET(req: NextRequest) {
  // Must fail closed. With `?? ''` and an unset BROWSE_SECRET, `?warm=` sends an
  // empty string that compares equal, letting anyone skip the session check below
  // and run the full eBay + comps warm path that writes the shared cache.
  const BROWSE_SECRET = process.env.BROWSE_SECRET ?? '';
  const warmParam = req.nextUrl.searchParams.get('warm');
  const warmMode = !!BROWSE_SECRET && warmParam === BROWSE_SECRET;

  // Cache-warm mode: called from cron, no user session needed. Runs searches + comps and saves cache.
  if (warmMode) {
    const existing = await r2Get<BrowseCache>(BROWSE_CACHE_KEY()).catch(() => null);
    if (existing && existing.items.length > 0) {
      const age = Date.now() - new Date(existing.generatedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ warmed: false, reason: 'cache already fresh', age: Math.round(age / 60000) + 'm' });
      }
    }
    if (!process.env.EBAY_CLIENT_ID) return NextResponse.json({ warmed: false, reason: 'no EBAY_CLIENT_ID' });
    try {
      const warmResults = await Promise.allSettled(
        BROWSE_CATEGORIES.map(c => searchDeals(c.query, 20, undefined, c.maxPrice))
      );
      const warmItems: EbayItem[] = [];
      const warmSeen = new Set<string>();
      warmResults.forEach((r, idx) => {
        if (r.status !== 'fulfilled') return;
        let picked = 0;
        for (const item of [...r.value].sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0))) {
          if (picked >= 2) break;
          if (!warmSeen.has(item.itemId) && !isJunk(item) && isFlippableItem(item.title)) {
            warmSeen.add(item.itemId);
            warmItems.push(item);
            picked++;
          }
        }
      });
      const flipResults = await Promise.allSettled(warmItems.map(item => quickFlipVerdict(item)));
      const browsed: BrowseDeal[] = [];
      warmItems.forEach((item, i) => {
        const r = flipResults[i];
        if (r.status !== 'fulfilled' || !r.value || r.value.verdict === 'skip') return;
        browsed.push({ ...item, flipVerdict: r.value.verdict, avgSoldPrice: r.value.avgSoldPrice, soldCount: r.value.soldCount, flipNetProfit: r.value.netProfit, flipMarginPct: r.value.marginPct, estDaysToSell: r.value.estDaysToSell, sourcesCount: r.value.sourcesCount ?? null, multiSourceConfidence: r.value.confidence });
      });
      browsed.sort((a, b) => { if (a.flipVerdict !== b.flipVerdict) return a.flipVerdict === 'buy' ? -1 : 1; return b.flipNetProfit - a.flipNetProfit; });

      // Filter out items from flagged sellers before caching
      try {
        const sellerMap = await checkSellersBatch(
          browsed.map(i => ({ seller: i.seller, feedbackPercent: i.sellerFeedbackPercent, feedbackScore: i.sellerFeedbackScore }))
        );
        const before = browsed.length;
        const filtered = browsed.filter(i => sellerMap.get(i.seller)?.verdict !== 'flag');
        if (filtered.length < before) console.log(`[browse] seller quality: removed ${before - filtered.length} item(s) from flagged sellers`);
        browsed.splice(0, browsed.length, ...filtered);
      } catch (e) { console.warn('[browse] seller quality check failed:', e); }

      if (browsed.length > 0) {
        const cache: BrowseCache = { items: browsed.slice(0, 15), generatedAt: new Date().toISOString() };
        await r2Put(BROWSE_CACHE_KEY(), JSON.stringify(cache));
        return NextResponse.json({ warmed: true, items: browsed.length });
      }
      return NextResponse.json({ warmed: false, reason: 'no qualifying items', searched: warmItems.length });
    } catch (err) {
      return NextResponse.json({ warmed: false, error: String(err) });
    }
  }

  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

  // Load auction deal cache in parallel with personalization signals
  const auctionCacheResult = await r2Get<{ generatedAt: string; items: any[] }>('deal-wiz/auction-deals.json').catch(() => null);
  const auctionItems: EbayItem[] = (auctionCacheResult?.items ?? []).map((item: any) => ({
    itemId: item.itemId,
    title: item.title,
    price: item.price,
    currency: item.currency ?? 'USD',
    marketPrice: item.marketPrice ?? null,
    discountPct: item.discountPct ?? null,
    condition: item.condition,
    imageUrl: item.imageUrl ?? '',
    additionalImages: [],
    itemUrl: item.itemUrl ?? '',
    seller: item.seller ?? '',
    sellerFeedbackScore: null,
    sellerFeedbackPercent: null,
    location: item.location ?? '',
    category: item.category ?? 'Electronics',
    shippingCost: item.shippingCost ?? null,
    localPickupOnly: false,
    listingType: 'AUCTION',
    listingDate: item.listingDate ?? null,
    quantity: 1,
  }));

  // Load all personalization signals in parallel
  const ebayToken = await getEbayAccessToken(session.userId).catch(() => null);
  const [userDeals, userPrefs, ebayTitles, ebayActivity, savedSearches, tasteResult, feedbackResult] = await Promise.allSettled([
    getDeals(session.userId),
    getUserPrefs(session.userId),
    fetchEbayOrderTitles(session.userId),
    fetchEbayBuyingActivity(session.userId),
    ebayToken ? getEbaySavedSearches(ebayToken) : Promise.resolve([] as string[]),
    computeTasteProfile(session.userId),
    getFeedback(session.userId),
  ]);
  const deals = userDeals.status === 'fulfilled' ? userDeals.value : [];
  const prefs = userPrefs.status === 'fulfilled' ? userPrefs.value : {};
  const orderTitles = ebayTitles.status === 'fulfilled' ? ebayTitles.value : [];
  const buying = ebayActivity.status === 'fulfilled' ? ebayActivity.value : { watchedTitles: [], wonTitles: [] };
  const userSavedSearches = savedSearches.status === 'fulfilled' ? savedSearches.value : [];
  const tasteWeights = tasteResult.status === 'fulfilled' ? tasteResult.value.categoryWeights : {};
  const excludedCategories: string[] = tasteResult.status === 'fulfilled' ? tasteResult.value.excludedCategories : [];
  const feedbackList = feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
  const dislikedIds = new Set(feedbackList.filter(f => f.verdict === 'down').map(f => f.itemId));
  const blockedKeywords: string[] = (prefs as any).blockedKeywords ?? [];
  const blockedKwPatterns = blockedKeywords.map((kw: string) =>
    new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  );

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

  const maxDays = prefs && (prefs as any).maxDaysToSell != null ? (prefs as any).maxDaysToSell as number : 20;

  // Serve from cache if fresh — personalize order before returning
  const cached = await r2Get<BrowseCache>(BROWSE_CACHE_KEY());
  const cacheHasItems = cached && cached.generatedAt && cached.items.length > 0;

  let cacheHidden: HiddenSummary = { total: 0, byKeyword: 0, byDisliked: 0, byCategory: 0, keywords: [] };
  const serveCache = (stale = false) => {
    // Re-apply sanity filter even on cached items — guards against stale bad data surviving a refresh
    const hasHistory = allWonTitles.length > 0 || buying.watchedTitles.length > 0;
    const sane = cached!.items.filter(i => i.flipNetProfit <= i.price);
    const filteredCache = applyUserFilters(sane, { dislikedIds, blockedKwPatterns, blockedKeywords, excludedCategories });
    cacheHidden = filteredCache.hidden;
    let items = filteredCache.kept;
    items = personalizeResults(items, categoryScores, tasteWeights, explicitCategories, allWonTitles, buying.watchedTitles, hasHistory);
    items = items.filter(i => i.estDaysToSell == null || i.estDaysToSell <= maxDays);

    // Add auction deals not already in the cache (dedup by itemId)
    const cachedIds = new Set(items.map(i => i.itemId));
    const auctionDeals: BrowseDeal[] = auctionItems
      .filter(i => !cachedIds.has(i.itemId) && !dislikedIds.has(i.itemId))
      .slice(0, 3)
      .map((i: any) => ({
        ...i,
        flipVerdict: i.flipVerdict ?? 'maybe',
        avgSoldPrice: i.avgSoldPrice ?? 0,
        soldCount: i.soldCount ?? 0,
        flipNetProfit: i.flipNetProfit ?? 0,
        flipMarginPct: i.flipMarginPct ?? 0,
        estDaysToSell: i.estDaysToSell ?? null,
        sourcesCount: i.sourcesCount ?? null,
        pickReason: (i.auctionSource === 'macbid' ? 'Mac.bid Like New' : 'Vista Auction Like New'),
      } as BrowseDeal));
    items = [...items, ...auctionDeals];

    const matchedFromEbay = items.filter(i => {
      const key = categoryKeyForTitle(i.title);
      return key && (buying.watchedTitles.length > 0 || allWonTitles.length > 0) && categoryScores.get(key) !== undefined;
    }).length;
    return NextResponse.json({ ...cached, items, fromCache: true, stale, inferredCategories: inferredCategories.length > 0 ? inferredCategories : undefined, personalizationDebug: { watchedCount: buying.watchedTitles.length, wonCount: allWonTitles.length, picksInfluenced: matchedFromEbay }, hidden: cacheHidden });
  };

  if (!forceRefresh && cacheHasItems) {
    const age = Date.now() - new Date(cached!.generatedAt).getTime();
    if (age < CACHE_TTL_MS) return serveCache();
  }

  if (!process.env.EBAY_CLIENT_ID) {
    return NextResponse.json({ error: 'eBay API not configured' }, { status: 503 });
  }

  try {
    // Fetch standard categories + saved searches + interest-category searches in parallel
    const savedSearchQueries = userSavedSearches.slice(0, 4);
    const interestSearches = getInterestSearches(categoryScores);
    const allSearches = [
      ...BROWSE_CATEGORIES.map(c => ({ query: c.query, maxPrice: c.maxPrice, isSavedSearch: false, isInterest: false })),
      ...savedSearchQueries.map(q => ({ query: q, maxPrice: undefined, isSavedSearch: true, isInterest: false })),
      ...interestSearches.map(c => ({ query: c.query, maxPrice: c.maxPrice, isSavedSearch: false, isInterest: true })),
    ];
    const searchResults = await Promise.allSettled(
      allSearches.map(c => searchDeals(c.query, 20, undefined, c.maxPrice))
    );

    const allItems: EbayItem[] = [];
    const savedSearchItems: EbayItem[] = [];
    const interestItems: EbayItem[] = [];
    const seen = new Set<string>();
    // Cap at 2 candidates per category. Saved-search and interest items skip the flippable whitelist.
    searchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        let picked = 0;
        const { isSavedSearch, isInterest } = allSearches[idx];
        const sorted = [...r.value].sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0) || b.price - a.price);
        for (const item of sorted) {
          if (picked >= 2) break;
          const passesFilter = !isJunk(item) && (isSavedSearch || isInterest || isFlippableItem(item.title));
          if (!seen.has(item.itemId) && passesFilter) {
            seen.add(item.itemId);
            allItems.push(item);
            if (isSavedSearch) savedSearchItems.push(item);
            if (isInterest) interestItems.push(item);
            picked++;
          }
        }
      }
    });

    const candidates = allItems;
    if (candidates.length === 0) {
      if (cacheHasItems) return serveCache(true);
      return NextResponse.json({ items: [], generatedAt: new Date().toISOString(), fromCache: false });
    }

    // Track personalized candidates before comps so we can pass them through even if 'skip'
    const personalizedCandidateIds = new Set([
      ...savedSearchItems.map(i => i.itemId),
      ...interestItems.map(i => i.itemId),
    ]);

    // Run sold comps on all candidates in parallel
    const flipResults = await Promise.allSettled(candidates.map(item => quickFlipVerdict(item)));

    const browsed: BrowseDeal[] = [];
    candidates.forEach((item, i) => {
      const r = flipResults[i];
      if (r.status !== 'fulfilled' || !r.value) return;
      // Skips are dropped for everyone. Personalized items used to bypass this and
      // were then relabelled 'skip' -> 'maybe', which is how a LEGO set at -$27 net
      // sat in a feed captioned "BUY verdict confirmed with real sold data".
      // Relevance is not a reason to show someone a loss.
      if (r.value.verdict === 'skip') return;
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

    const savedSearchCandidateIds = new Set(savedSearchItems.map(i => i.itemId));
    const interestCandidateIds = new Set(interestItems.map(i => i.itemId));

    // Priority: saved-search picks (2 slots) → interest-category picks (4 slots) → standard pool
    const savedSearchPicks = filteredBrowsed.filter(i => savedSearchCandidateIds.has(i.itemId)).slice(0, 2);
    const savedSearchPickIds = new Set(savedSearchPicks.map(i => i.itemId));
    const interestPicks = filteredBrowsed.filter(i => interestCandidateIds.has(i.itemId) && !savedSearchPickIds.has(i.itemId)).slice(0, 4);
    const interestPickIds = new Set(interestPicks.map(i => i.itemId));
    const standardPicks = filteredBrowsed.filter(i => !savedSearchPickIds.has(i.itemId) && !interestPickIds.has(i.itemId)).slice(0, 9);
    const merged = [...savedSearchPicks, ...interestPicks, ...standardPicks].slice(0, 15);

    // Tag items with their source
    merged.forEach(item => {
      if (savedSearchPickIds.has(item.itemId)) {
        (item as any).pickReason = '🔍 From your eBay saved searches';
      } else if (interestPickIds.has(item.itemId)) {
        (item as any).pickReason = '🛍 Matches your purchase history';
      }
    });

    const result: BrowseCache = {
      items: merged,
      generatedAt: new Date().toISOString(),
    };

    // Never poison the cache with empty results — fall back to stale cache
    if (result.items.length === 0 && cacheHasItems) return serveCache(true);

    if (result.items.length > 0) {
      await r2Put(BROWSE_CACHE_KEY(), JSON.stringify(result));
    }
    const hasHistory = allWonTitles.length > 0 || buying.watchedTitles.length > 0;
    const freshFiltered = applyUserFilters(
      personalizeResults(result.items, categoryScores, tasteWeights, explicitCategories, allWonTitles, buying.watchedTitles, hasHistory),
      { dislikedIds, blockedKwPatterns, blockedKeywords, excludedCategories },
    );
    const personalizedItems = freshFiltered.kept;
    const matchedFromEbay = personalizedItems.filter(i => {
      const key = categoryKeyForTitle(i.title);
      return key && (buying.watchedTitles.length > 0 || allWonTitles.length > 0) && categoryScores.get(key) !== undefined;
    }).length;
    return NextResponse.json({ ...result, items: personalizedItems, fromCache: false, inferredCategories: inferredCategories.length > 0 ? inferredCategories : undefined, personalizationDebug: { watchedCount: buying.watchedTitles.length, wonCount: allWonTitles.length, picksInfluenced: matchedFromEbay }, hidden: freshFiltered.hidden });

  } catch (err: any) {
    // eBay rate limited — serve stale cache if available rather than returning an error
    if (cacheHasItems && (String(err).includes('Too many requests') || String(err).includes('2001') || String(err).includes('rate'))) {
      return serveCache(true);
    }
    return NextResponse.json({ error: err.message || 'Browse failed' }, { status: 500 });
  }
}
