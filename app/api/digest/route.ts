import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';
import { searchDeals, EbayItem, filterLiveItems } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals, sellabilityScore } from '@/lib/deal-score';
import { sendDailyDigest, FlipData, buildSpotlightUrl } from '@/lib/notify';
import { sendSMSDigest } from '@/lib/sms';
import { r2Get, r2Put } from '@/lib/r2';
import { getAllUsers, getUserByEmail } from '@/lib/users';
import { orchestrateDigestSelection } from '@/lib/deal-orchestrator';
import { getUserPrefs, saveUserPrefs, getDeals } from '@/lib/tracker-data';
import { inferCategoriesFromDeals, inferCategoryScores, categoryKeyForTitle } from '@/lib/infer-categories';
import { fetchEbayOrderTitles, fetchEbaySavedSearchQueries } from '@/lib/ebay-orders';
import { computeTasteProfile, TasteProfile } from '@/lib/user-taste';
import { searchSoldComps } from '@/lib/ebay-comps';
import { getMultiSourceComps } from '@/lib/multi-source-comps';
import { checkItemQuality, isFlippableItem } from '@/lib/item-quality';
import { analyzeFlip } from '@/lib/flip-agent';
import { sendPushToSubscriptions } from '@/lib/push-notify';
import { checkSellersBatch } from '@/lib/seller-quality';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const runtime = 'nodejs';
export const maxDuration = 300;

const DIGEST_STATE_PATH = 'deal-wiz/digest-state.json';
const DIGEST_SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

// Categories to search when live eBay API is available
const SEARCH_QUERIES = DIGEST_CATEGORIES.map(c => ({ query: c.query, categoryId: c.categoryId }));

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const force  = req.nextUrl.searchParams.get('force') === '1';

  if (secret !== DIGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?check=1 returns diagnostic state without running the digest
  if (req.nextUrl.searchParams.get('check') === '1') {
    const state = await r2Get<{ lastSentDate: string; lastRunResult?: string; lastRunDeals?: number; lastRunError?: string }>(DIGEST_STATE_PATH);
    const users = await getAllUsers();
    const userPrefsResults = await Promise.allSettled(users.map(u => getUserPrefs(u.userId)));
    const recipientCount = userPrefsResults
      .filter(r => r.status === 'fulfilled' && r.value?.notificationEmail)
      .length;
    return NextResponse.json({
      lastSentDate: state?.lastSentDate ?? null,
      lastRunResult: state?.lastRunResult ?? null,
      lastRunDeals: state?.lastRunDeals ?? null,
      lastRunError: state?.lastRunError ?? null,
      todayKey: todayKey(),
      wouldSkip: state?.lastSentDate === todayKey(),
      userCount: users.length,
      recipientCount,
      digestSecretSet: !!process.env.DIGEST_SECRET,
      sendgridKeySet: !!process.env.SENDGRID_API_KEY,
      sessionSecretSet: !!process.env.SESSION_SECRET,
      ebayClientIdSet: !!process.env.EBAY_CLIENT_ID,
    });
  }

  // ?reset-state=1 clears the sent-today guard without sending (for testing)
  if (req.nextUrl.searchParams.get('reset-state') === '1') {
    await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: '2000-01-01' }));
    return NextResponse.json({ reset: true, message: 'Digest state cleared — next cron run will send.' });
  }

  // ?sms= sends a one-off test text without running the full digest
  const smsTest = req.nextUrl.searchParams.get('sms') || null;
  if (smsTest) {
    try {
      const { sendSMSDigest: sendSMS } = await import('@/lib/sms');
      const { MOCK_DEALS: mockDeals } = await import('@/lib/mock-deals');
      await sendSMS(mockDeals.slice(0, 5), smsTest);
      return NextResponse.json({ sent: true, sms: smsTest });
    } catch (err) {
      return NextResponse.json({ sent: false, sms: smsTest, error: String(err) }, { status: 500 });
    }
  }

  // Prevent double-sending on the same day unless forced
  if (!force) {
    const state = await r2Get<{ lastSentDate: string }>(DIGEST_STATE_PATH);
    if (state?.lastSentDate === todayKey()) {
      return NextResponse.json({ skipped: true, reason: 'Already sent today', date: todayKey() });
    }
  }

  const forceMock = req.nextUrl.searchParams.get('mock') === '1';
  // ?to= overrides for manual testing; otherwise sends to all registered users
  const toOverride = req.nextUrl.searchParams.get('to') || null;

  // Claim today's slot immediately — prevents duplicate sends if Vercel retries
  // a failed/timed-out cron invocation (Vercel retries non-2xx cron responses).
  if (!force && !toOverride) {
    try { await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey() })); }
    catch (e) { console.warn('[digest] Could not write sent-today guard:', e); }
  }

  try {
    let allItems;
    // Pre-load auction cache so it can be used for both allItems injection and flipMap seeding
    let _auctionCache: { generatedAt: string; items: any[] } | null = null;
    try {
      _auctionCache = await r2Get<{ generatedAt: string; items: any[] }>('deal-wiz/auction-deals.json');
    } catch { /* non-fatal */ }

    if (forceMock || process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID) {
      allItems = MOCK_DEALS;
    } else {
      // Run searches in batches of 5 with a small delay to avoid rate limiting
      const allResults: EbayItem[] = [];
      const batchSize = 5;
      for (let i = 0; i < SEARCH_QUERIES.length; i += batchSize) {
        const batch = SEARCH_QUERIES.slice(i, i + batchSize) as { query: string; categoryId: string; maxPrice?: number }[];
        const batchResults = await Promise.allSettled(batch.map(({ query, categoryId, maxPrice }) => searchDeals(query, 30, categoryId, maxPrice)));
        batchResults.forEach(r => { if (r.status === 'fulfilled') allResults.push(...r.value); });
        if (i + batchSize < SEARCH_QUERIES.length) await new Promise(r => setTimeout(r, 500));
      }
      const seen = new Set<string>();
      allItems = allResults.filter(item => {
        if (seen.has(item.itemId)) return false;
        seen.add(item.itemId);
        return true;
      });
      console.log(`[digest] eBay searches: ${SEARCH_QUERIES.length} total, ${allItems.length} raw items`);
    }

    // Inject Like New auction items from Mac.bid / Vista (scraped daily at 8 AM UTC)
    if (_auctionCache?.items?.length) {
      const auctionEbayItems: EbayItem[] = _auctionCache.items.map((item: any) => ({
        itemId: item.itemId,
        title: item.title,
        price: item.price,
        currency: 'USD',
        marketPrice: item.avgSoldPrice ? Math.round(item.avgSoldPrice / 0.85) : null,
        discountPct: null,
        condition: item.condition ?? 'Like New',
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
      allItems = [...allItems, ...auctionEbayItems];
      console.log(`[digest] injected ${auctionEbayItems.length} Like New auction items from Mac.bid/Vista`);
    }

    // Hard-remove refurbished items and non-flippable categories before scoring
    const nonRefurb = allItems.filter(i =>
      !/refurb/i.test(i.condition) && !/refurb/i.test(i.title) && isFlippableItem(i.title)
    );
    const itemPool = nonRefurb.length >= 10 ? nonRefurb : allItems;
    console.log(`[digest] non-refurb items: ${nonRefurb.length} of ${allItems.length}`);

    // Pull a large candidate pool — eBay Browse API rarely includes seller-claimed original prices,
    // so we can't pre-filter by discountPct. Instead take the top 40 by sellability score and let
    // multi-source comps determine actual flip value. Fall back to mock only if eBay is fully down.
    let candidates = topDeals(itemPool, 40, 0);
    if (candidates.length === 0) {
      console.warn('[digest] No qualifying deals from eBay — falling back to MOCK_DEALS');
      candidates = topDeals(MOCK_DEALS, 40, 40);
    }

    // Remove sold/expired listings — non-blocking: if verification throws, keep unfiltered candidates
    if (!forceMock && process.env.EBAY_CLIENT_ID) {
      try {
        const live = await filterLiveItems(candidates);
        if (live.length > 0) candidates = live;
      } catch (e) {
        console.warn('[digest] filterLiveItems failed, using unfiltered candidates:', e);
      }
    }

    // Sort by sellabilityScore, take top 40 for comp checking
    candidates = [...candidates]
      .sort((a, b) => sellabilityScore(b, candidates) - sellabilityScore(a, candidates))
      .slice(0, 40);

    // Run multi-source comps on all candidates in parallel
    const flipResults = await Promise.allSettled(
      candidates.map(item => getMultiSourceComps(item.title, 12, item.condition))
    );
    const flipMap = new Map<string, FlipData>();

    // Seed flipMap with pre-computed auction deal data so they skip the comp pipeline
    if (_auctionCache?.items?.length) {
      _auctionCache.items.forEach((item: any) => {
        if (item.flipNetProfit != null && item.avgSoldPrice != null) {
          flipMap.set(item.itemId, {
            verdict: item.flipVerdict ?? 'maybe',
            netProfit: item.flipNetProfit,
            avgSoldPrice: item.avgSoldPrice,
            soldCount: item.soldCount ?? 0,
            marginPct: item.flipMarginPct ?? 0,
            estDaysToSell: item.estDaysToSell ?? null,
            sourcesCount: item.sourcesCount ?? null,
            stockxLastSale: item.stockxLastSale ?? null,
            mercariAvgSold: item.mercariAvgSold ?? null,
            amazonPrice: item.amazonPrice ?? null,
            fbMarketplaceAvg: null,
          });
        }
      });
    }

    const profitableIds = new Set<string>();
    candidates.forEach((item, i) => {
      const r = flipResults[i];
      if (r.status !== 'fulfilled' || !r.value) return;
      const { weightedAvgSoldPrice, ebayCount } = r.value;
      const refPrice = ebayCount >= 1 ? weightedAvgSoldPrice : (item.marketPrice ?? 0);
      if (refPrice <= 0) return;
      // Sanity check: sold avg > 3× listing price means comp query matched wrong items
      if (refPrice > item.price * 3) return;
      const netProfit = Math.round(refPrice * 0.85 - item.price - (item.shippingCost ?? 0));
      const marginPct = Math.round((netProfit / item.price) * 100);
      let verdict: 'buy' | 'maybe' | 'skip';
      if (netProfit > 30 || (netProfit > 20 && marginPct > 15)) verdict = 'buy';
      else if (netProfit < 5) verdict = 'skip';
      else verdict = 'maybe';
      if (netProfit >= 25 && verdict === 'skip') verdict = 'maybe';
      const days = r.value.estDaysToSell;
      if (days != null && days > 60) verdict = 'skip';
      else if (days != null && days > 30 && verdict === 'buy') verdict = 'maybe';
      if (verdict !== 'skip' && netProfit > 0) profitableIds.add(item.itemId);
      flipMap.set(item.itemId, { verdict, netProfit, avgSoldPrice: refPrice, soldCount: ebayCount, marginPct, estDaysToSell: days, sourcesCount: r.value.sourcesUsed.length, stockxLastSale: r.value.stockxLastSale ?? null, mercariAvgSold: r.value.mercariAvg ?? null, amazonPrice: r.value.amazonPrice ?? null, fbMarketplaceAvg: null, macbidAvg: r.value.macbidAvg ?? null, vistaAvg: r.value.vistaAvg ?? null });
    });

    // Filter out damaged/broken items — run only on profitable candidates to save API calls
    const profitableCandidates = candidates.filter(i => profitableIds.has(i.itemId));
    const qualityResults = await Promise.allSettled(
      profitableCandidates.map(item => checkItemQuality(item.itemId, item.title))
    );
    profitableCandidates.forEach((item, i) => {
      const r = qualityResults[i];
      if (r.status === 'fulfilled' && r.value.broken) flipMap.delete(item.itemId);
    });

    // Speed-adjusted score: profit × (14 / daysToSell)^0.4
    // 14 days = neutral baseline; faster items get a boost, slower get a penalty
    const dealScore = (flip: FlipData): number => {
      const days = flip.estDaysToSell ?? 14;
      return flip.netProfit * Math.pow(14 / Math.max(1, days), 0.4);
    };

    // Pick best N items — BUY/MAYBE with positive profit only, sorted by speed-adjusted score
    const pickBest = (pool: typeof candidates, n: number): typeof candidates => {
      const scored = pool.map(item => ({ item, flip: flipMap.get(item.itemId) }));
      const buys = scored.filter(x => x.flip?.verdict === 'buy' && (x.flip?.netProfit ?? 0) > 0)
        .sort((a, b) => dealScore(b.flip!) - dealScore(a.flip!));
      const maybes = scored.filter(x => x.flip?.verdict === 'maybe' && (x.flip?.netProfit ?? 0) > 0)
        .sort((a, b) => dealScore(b.flip!) - dealScore(a.flip!));
      const unknowns = scored.filter(x => !x.flip && (x.item.marketPrice ?? 0) > 0 && Math.round((x.item.marketPrice ?? 0) * 0.85 - x.item.price) > 0);
      return [...buys, ...maybes, ...unknowns].map(x => x.item).slice(0, n);
    };

    let best5 = pickBest(candidates, 5);
    // If not enough positive-profit deals, fill with best-available non-skip items (including no-flip-data)
    if (best5.length < 5) {
      console.log(`[digest] Only ${best5.length} positive-profit deals — filling with best available`);
      const picked = new Set(best5.map(i => i.itemId));
      const remaining = candidates
        .filter(i => !picked.has(i.itemId) && flipMap.get(i.itemId)?.verdict !== 'skip')
        .sort((a, b) => {
          const an = flipMap.get(a.itemId)?.netProfit ?? -999;
          const bn = flipMap.get(b.itemId)?.netProfit ?? -999;
          if (bn !== an) return bn - an;
          return (b.discountPct ?? 0) - (a.discountPct ?? 0);
        });
      best5 = [...best5, ...remaining].slice(0, 5);
    }
    // If still < 5, fill from the full item pool sorted by discount (no comps required)
    if (best5.length < 5) {
      const picked = new Set(best5.map(i => i.itemId));
      const byDiscount = itemPool
        .filter(i => !picked.has(i.itemId) && (i.discountPct ?? 0) >= 30)
        .sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0));
      best5 = [...best5, ...byDiscount].slice(0, 5);
    }
    // Last resort — if still empty, take any item sorted by price descending
    if (best5.length === 0) {
      console.warn('[digest] All filters yielded 0 items — using raw itemPool last resort');
      best5 = [...itemPool].sort((a, b) => b.price - a.price).slice(0, 5);
    }
    // Re-analyze top 5 with AI agent for accurate, consistent stats
    const aiResults = await Promise.allSettled(
      best5.map(item => analyzeFlip(item.title, item.price, item.shippingCost ?? 0, null, null, item.condition))
    );
    best5.forEach((item, i) => {
      const r = aiResults[i];
      if (r.status !== 'fulfilled' || !r.value) return;
      const v = r.value;
      flipMap.set(item.itemId, {
        verdict: v.verdict,
        netProfit: v.netProfit,
        avgSoldPrice: v.avgSoldPrice,
        soldCount: v.soldCount,
        marginPct: v.marginPct,
        estDaysToSell: v.daysToSell ?? null,
        sourcesCount: v.sourcesCount ?? null,
        stockxLastSale: v.stockxLastSale ?? null,
        mercariAvgSold: v.mercariAvgSold ?? null,
        amazonPrice: v.amazonPrice ?? null,
        fbMarketplaceAvg: v.fbMarketplaceAvg ?? null,
      });
    });
    console.log(`[digest] best5 AI profits: ${best5.map(i => flipMap.get(i.itemId)?.netProfit ?? 'n/a').join(', ')}`);

    // Final live-check on best5 — removes any items that sold between the initial scan and now
    if (!forceMock && process.env.EBAY_CLIENT_ID) {
      try {
        const liveFinal = await filterLiveItems(best5);
        if (liveFinal.length < best5.length) {
          const deadCount = best5.length - liveFinal.length;
          console.log(`[digest] final live check: ${deadCount} expired item(s) removed from best5`);
          const usedIds = new Set(liveFinal.map(i => i.itemId));
          const fill = candidates.filter(i => !usedIds.has(i.itemId) && flipMap.get(i.itemId)?.verdict !== 'skip');
          best5 = [...liveFinal, ...fill].slice(0, 5);
        }
      } catch (e) { console.warn('[digest] final live check failed:', e); }
    }

    // Seller quality check — filter out items from flagged sellers before emailing
    if (!forceMock && process.env.EBAY_CLIENT_ID) {
      try {
        const sellerMap = await checkSellersBatch(
          best5.map(i => ({ seller: i.seller, feedbackPercent: i.sellerFeedbackPercent, feedbackScore: i.sellerFeedbackScore }))
        );
        const beforeCount = best5.length;
        best5 = best5.filter(i => sellerMap.get(i.seller)?.verdict !== 'flag');
        const removed = beforeCount - best5.length;
        if (removed > 0) {
          console.log(`[digest] seller quality check: removed ${removed} item(s) from flagged sellers`);
          const usedIds = new Set(best5.map(i => i.itemId));
          const fill = candidates.filter(i => !usedIds.has(i.itemId) && flipMap.get(i.itemId)?.verdict !== 'skip' && sellerMap.get(i.seller)?.verdict !== 'flag');
          best5 = [...best5, ...fill].slice(0, 5);
        }
      } catch (e) { console.warn('[digest] seller quality check failed:', e); }
    }

    // Build recipient list with personalized deals per user
    type UserDigest = { userId: string; email: string; deals: typeof best5; aiPick?: string; aiPickItemId?: string | null; maxDaysToSell: number; minNetProfit: number; tasteWeights: Record<string, number>; excludedCategories: string[] };
    let userDigests: UserDigest[] = [];

    if (toOverride) {
      const overrideUser = await getUserByEmail(toOverride);
      userDigests = [{ userId: overrideUser?.userId ?? '', email: toOverride, deals: best5, maxDaysToSell: 20, minNetProfit: 15, tasteWeights: {}, excludedCategories: [] }];
    } else {
      const users = await getAllUsers();
      const [prefsResults, dealsResults, orderTitleResults, savedSearchResults, tasteResults] = await Promise.all([
        Promise.allSettled(users.map(u => getUserPrefs(u.userId))),
        Promise.allSettled(users.map(u => getDeals(u.userId))),
        Promise.allSettled(users.map(u => fetchEbayOrderTitles(u.userId))),
        Promise.allSettled(users.map(u => fetchEbaySavedSearchQueries(u.userId))),
        Promise.allSettled(users.map(u => computeTasteProfile(u.userId))),
      ]);

      for (let i = 0; i < users.length; i++) {
        const r = prefsResults[i];
        if (r.status !== 'fulfilled') continue;
        const prefs = r.value;
        // Only send to users who explicitly opted in via Settings — never use registration email as fallback
        const recipientEmail = prefs.notificationEmail;
        if (!recipientEmail) continue;

        const count = prefs.digestCount ?? 5;

        // Use explicit categories; if none set, infer from tracker history
        const dr = dealsResults[i];
        const userDeals = dr.status === 'fulfilled' ? dr.value : [];
        const orderResult = orderTitleResults[i];
        const ebayOrderTitles = orderResult.status === 'fulfilled' ? orderResult.value : [];
        const savedSearchResult = savedSearchResults[i];
        const ebaySavedSearches = savedSearchResult.status === 'fulfilled' ? savedSearchResult.value : [];

        let activeCategories = prefs.digestCategories ?? [];
        if (activeCategories.length === 0) {
          activeCategories = inferCategoriesFromDeals(userDeals);
        }

        // Weighted category affinity — eBay purchase history (0.7) + tracker deals (0.3)
        const categoryAffinity = inferCategoryScores(activeCategories, [], ebayOrderTitles, userDeals);

        // Taste profile from explicit thumbs up/down feedback
        const tasteResult = tasteResults[i];
        const taste: TasteProfile = tasteResult.status === 'fulfilled' ? tasteResult.value : { categoryWeights: {}, excludedCategories: [], dislikedItemIds: new Set(), minNetProfit: 15 };

        // Filter allItems by preferred categories if we have any
        let pool = allItems;
        if (activeCategories.length > 0) {
          const allowedQueries = DIGEST_CATEGORIES
            .filter(c => activeCategories.includes(c.key))
            .map(c => c.query.toLowerCase());
          pool = allItems.filter(item =>
            allowedQueries.some(q => item.title.toLowerCase().includes(q.split(' ')[0]))
          );
          if (pool.length === 0) pool = allItems; // fallback to all if filter yields nothing
        }

        // Build a large candidate pool for this user — pass prefs so maxTechAge etc. are respected
        const userFilterPrefs = {
          maxTechAgeYears: prefs.filterPrefs?.maxTechAgeYears ?? 2,
          minPrice: prefs.defaultPriceMin,
          maxPrice: prefs.defaultPriceMax,
          showLocalPickup: prefs.showLocalPickup ?? false,
        };

        // Filter out items sent in the last 30 days to prevent digest repetition
        const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const cutoff14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const sentEntries = prefs.sentItemIds ?? [];
        const recentlySentIds30 = new Set(sentEntries.filter(s => new Date(s.sentAt).getTime() > cutoff30).map(s => s.itemId));
        const recentlySentIds14 = new Set(sentEntries.filter(s => new Date(s.sentAt).getTime() > cutoff14).map(s => s.itemId));

        const basePool = topDeals(pool, 40, 0, userFilterPrefs);
        let userPool = basePool.filter(item => !recentlySentIds30.has(item.itemId));
        if (userPool.length < 5) userPool = basePool.filter(item => !recentlySentIds14.has(item.itemId)); // expand to 14d window if thin
        if (userPool.length === 0) userPool = basePool; // fallback: ignore dedup entirely
        if (userPool.length === 0) userPool = [...candidates];

        // Merge manual watchlist queries + eBay saved searches (cap at 5 total to limit API calls)
        const allPersonalQueries = [
          ...(prefs.watchlistQueries ?? []),
          ...ebaySavedSearches.filter(q => !(prefs.watchlistQueries ?? []).includes(q)),
        ].slice(0, 5);

        if (allPersonalQueries.length > 0) {
          const personalResults = await Promise.allSettled(allPersonalQueries.map(q => searchDeals(q, 20)));
          const seen = new Set<string>();
          const personalItems = personalResults
            .flatMap(res => res.status === 'fulfilled' ? res.value : [])
            .filter(item => { if (seen.has(item.itemId)) return false; seen.add(item.itemId); return true; });
          if (personalItems.length > 0) {
            console.log(`[digest] user ${users[i].userId} personal queries: ${allPersonalQueries.length} (${ebaySavedSearches.length} from eBay saved searches), items: ${personalItems.length}`);
            userPool = [...personalItems, ...userPool];
          }
        }

        // Hard-remove individually disliked items and hard-excluded categories
        userPool = userPool.filter(i => {
          if (taste.dislikedItemIds.has(i.itemId)) return false;
          if (taste.excludedCategories.length > 0) {
            const key = categoryKeyForTitle(i.title);
            if (key && taste.excludedCategories.includes(key)) return false;
          }
          return true;
        });

        // Dedupe, then sort by sellability boosted by affinity and taste feedback
        const seenIds = new Set<string>();
        userPool = userPool.filter(i => { if (seenIds.has(i.itemId)) return false; seenIds.add(i.itemId); return true; });
        userPool = userPool.sort((a, b) => {
          const affinityBoost = (item: typeof a) => {
            const key = categoryKeyForTitle(item.title);
            return 1 + (key ? (categoryAffinity.get(key) ?? 0) * 0.5 : 0);
          };
          const tasteBoost = (item: typeof a) => {
            const key = categoryKeyForTitle(item.title);
            return key ? (taste.categoryWeights[key] ?? 1.0) : 1.0;
          };
          return sellabilityScore(b, userPool) * affinityBoost(b) * tasteBoost(b)
               - sellabilityScore(a, userPool) * affinityBoost(a) * tasteBoost(a);
        }).slice(0, 30);

        userDigests.push({ userId: users[i].userId, email: recipientEmail, deals: userPool, maxDaysToSell: prefs.maxDaysToSell ?? 20, minNetProfit: taste.minNetProfit, tasteWeights: taste.categoryWeights, excludedCategories: taste.excludedCategories });
      }

      if (userDigests.length === 0 && process.env.NOTIFICATION_EMAIL) {
        userDigests = [{ userId: '', email: process.env.NOTIFICATION_EMAIL, deals: best5, maxDaysToSell: 20, minNetProfit: 15, tasteWeights: {}, excludedCategories: [] }];
      }
    }

    if (userDigests.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No recipients configured' });
    }

    // Run multi-source comps on all user-pool items not already in flipMap
    const allUserItems = userDigests.flatMap(d => d.deals).filter(i => !flipMap.has(i.itemId));
    const extraFlips = await Promise.allSettled(
      allUserItems.map(item => getMultiSourceComps(item.title, 12))
    );
    allUserItems.forEach((item, i) => {
      const r = extraFlips[i];
      if (r.status !== 'fulfilled' || !r.value) return;
      const { weightedAvgSoldPrice, ebayCount } = r.value;
      const refPrice = ebayCount >= 1 ? weightedAvgSoldPrice : (item.marketPrice ?? 0);
      if (refPrice <= 0) return;
      const netProfit = Math.round(refPrice * 0.85 - item.price - (item.shippingCost ?? 0));
      const marginPct = Math.round((netProfit / item.price) * 100);
      let verdict: 'buy' | 'maybe' | 'skip' = netProfit > 50 || (netProfit > 30 && marginPct > 20) ? 'buy' : netProfit < 10 || (netProfit < 20 && marginPct < 10) ? 'skip' : 'maybe';
      if (netProfit >= 40 && verdict === 'skip') verdict = 'maybe';
      const daysU = r.value.estDaysToSell;
      if (daysU != null && daysU > 20) verdict = 'skip';
      else if (daysU != null && daysU > 14 && verdict === 'buy') verdict = 'maybe';
      flipMap.set(item.itemId, { verdict, netProfit, avgSoldPrice: refPrice, soldCount: ebayCount, marginPct, estDaysToSell: daysU, sourcesCount: r.value.sourcesUsed.length, stockxLastSale: r.value.stockxLastSale ?? null, mercariAvgSold: r.value.mercariAvg ?? null, amazonPrice: r.value.amazonPrice ?? null, macbidAvg: r.value.macbidAvg ?? null, vistaAvg: r.value.vistaAvg ?? null });
    });

    // Minimum net profit to include a deal in the digest
    const MIN_NET_PROFIT = 15;

    // A2A orchestration: a Claude agent selects the best deals per user, calling the
    // seller-quality sub-agent as a tool when it needs to investigate a borderline seller.
    // Falls back to deterministic scoring inside orchestrateDigestSelection if the API is down.
    const orchestratedDigests = await Promise.allSettled(
      userDigests.map(d =>
        orchestrateDigestSelection(d.deals, flipMap, d.maxDaysToSell, d.minNetProfit ?? MIN_NET_PROFIT, 5, d.tasteWeights, d.excludedCategories)
          .then(result => {
            const itemById = new Map(d.deals.map(i => [i.itemId, i]));
            const finalDeals = result.rankedItemIds
              .map(id => itemById.get(id))
              .filter((i): i is EbayItem => i != null);

            // Safety net: if orchestrator returned nothing, fall back to best-discount items
            const safeDeals = finalDeals.length > 0
              ? finalDeals
              : [...d.deals].sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0)).slice(0, 5);

            console.log(`[digest] user ${d.userId} orchestrated deals: ${safeDeals.length}, profits: ${safeDeals.map(i => flipMap.get(i.itemId)?.netProfit ?? 'n/a').join(', ')}`);
            console.log(`[digest] user ${d.userId} orchestrator reasoning: ${result.reasoning.slice(0, 120)}`);
            return { ...d, deals: safeDeals };
          })
      )
    );
    userDigests = orchestratedDigests.map((r, i) =>
      r.status === 'fulfilled' ? r.value : userDigests[i]
    );

    // Log pre-filter state for diagnostics — visible in Vercel function logs
    console.log(`[digest] pre-send summary: ${userDigests.map(d => `${d.email}(${d.deals.length} deals, minProfit=$${d.minNetProfit})`).join(', ')}`);

    // Drop users with no qualifying deals — better to send nothing than junk
    userDigests = userDigests.filter(d => d.deals.length > 0);

    // Generate per-user AI pick from their actual deal list
    const generateAiPick = async (deals: typeof best5): Promise<{ text: string; itemId: string | null }> => {
      const eligible = deals.filter(i => { const f = flipMap.get(i.itemId); return !f || f.verdict !== 'skip'; });
      const pool = eligible.length > 0 ? eligible : deals;
      console.log(`[digest] generateAiPick: ${deals.length} deals, ${eligible.length} eligible, hasApiKey=${!!process.env.ANTHROPIC_API_KEY}`);

      // Match AI text to the pool item whose title shares the most words
      const matchItemId = (text: string): string | null => {
        const words = new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        let best = 0, bestId: string | null = null;
        for (const item of pool) {
          const overlap = item.title.toLowerCase().split(/\W+/).filter(w => words.has(w)).length;
          if (overlap > best) { best = overlap; bestId = item.itemId; }
        }
        return best >= 2 ? bestId : pool[0]?.itemId ?? null;
      };

      const deterministicPick = (): { text: string; itemId: string | null } => {
        const buyItems = pool.filter(i => flipMap.get(i.itemId)?.verdict === 'buy');
        const ranked = [...(buyItems.length > 0 ? buyItems : pool)].sort((a, b) => {
          const af = flipMap.get(a.itemId); const bf = flipMap.get(b.itemId);
          const ap = af?.netProfit ?? (a.marketPrice ? Math.round(a.marketPrice * 0.85 - a.price - (a.shippingCost ?? 0)) : 0);
          const bp = bf?.netProfit ?? (b.marketPrice ? Math.round(b.marketPrice * 0.85 - b.price - (b.shippingCost ?? 0)) : 0);
          return bp - ap;
        });
        const top = ranked[0];
        if (!top) return { text: "Check today's deals for great flip opportunities.", itemId: null };
        const flip = flipMap.get(top.itemId);
        const net = flip?.netProfit ?? (top.marketPrice ? Math.round(top.marketPrice * 0.85 - top.price - (top.shippingCost ?? 0)) : null);
        const comps = flip ? ` ${flip.soldCount} recent sold comps at avg $${flip.avgSoldPrice}.` : '';
        return { text: `Go with the ${top.title} — buy at $${top.price}${net != null ? `, ~$${net} net profit` : ''}.${comps}`, itemId: top.itemId };
      };

      const topLines = pool.slice(0, 5).map(i => {
        const flip = flipMap.get(i.itemId);
        const netProfit = flip ? flip.netProfit : (i.marketPrice ? Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) : null);
        const verdictNote = flip ? ` [${flip.verdict.toUpperCase()} — ${flip.soldCount} comps @ avg $${flip.avgSoldPrice}]` : '';
        return `${i.title} — buy $${i.price}, net profit ~$${netProfit ?? '?'}${verdictNote}. Condition: ${i.condition}.`;
      }).join('\n');
      const prompt = `You are a sharp eBay flip advisor. Net profit figures already account for eBay fees. Pick the single best flip opportunity from the list below and recommend it by its full item name (never use position numbers). You MUST recommend exactly one item — do not say "skip all" or refuse to pick. Reference the net profit and sold comps data. Be direct, specific, and under 50 words. No disclaimers. No markdown formatting.\n\n${topLines}`;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
          const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
          console.log(`[digest] AI pick attempt ${attempt} result: "${text.slice(0, 80)}"`);
          const isRefusal = /nothing.*recommend|cannot.*recommend|no.*recommend|skip all|no item|not recommend|unable to recommend/i.test(text);
          if (text && !isRefusal) return { text, itemId: matchItemId(text) };
        } catch (e) { console.error('[digest] AI pick attempt failed:', e); }
      }

      const fallback = deterministicPick();
      console.log(`[digest] AI pick using deterministic fallback: "${fallback.text.slice(0, 80)}"`);
      return fallback;
    };

    // Generate AI picks for all users in parallel
    const aiPickResults = await Promise.allSettled(userDigests.map(d => generateAiPick(d.deals)));
    aiPickResults.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[digest] AI pick ${i} rejected:`, r.reason);
      else console.log(`[digest] AI pick ${i}: "${r.value?.text?.slice(0, 80)}" itemId=${r.value?.itemId}`);
    });
    userDigests = userDigests.map((d, i) => ({
      ...d,
      aiPick: aiPickResults[i].status === 'fulfilled' ? (aiPickResults[i] as PromiseFulfilledResult<{ text: string; itemId: string | null }>).value?.text : undefined,
      aiPickItemId: aiPickResults[i].status === 'fulfilled' ? (aiPickResults[i] as PromiseFulfilledResult<{ text: string; itemId: string | null }>).value?.itemId ?? null : null,
    }));

    // Deduplicate by email — if 2 user records share the same email, only send once
    const seenEmails = new Set<string>();
    userDigests = userDigests.filter(d => {
      const key = d.email.toLowerCase();
      if (seenEmails.has(key)) return false;
      seenEmails.add(key);
      return true;
    });

    // Send emails sequentially with a small delay to stay under Resend's 5 req/s rate limit
    const sendResults: PromiseSettledResult<void>[] = [];
    for (const { userId, email, deals, aiPick } of userDigests) {
      const result = await sendDailyDigest(deals, email, aiPick, flipMap, userId || undefined).then(
        () => ({ status: 'fulfilled' as const, value: undefined }),
        (reason) => ({ status: 'rejected' as const, reason })
      );
      if (result.status === 'rejected') console.error(`[digest] send FAILED to ${email}:`, result.reason);
      else console.log(`[digest] send OK to ${email}`);
      sendResults.push(result);
      await new Promise(r => setTimeout(r, 250)); // 250ms between sends = ~4 req/s
    }

    // Save per-user digest cache so the app shows the same items as the email
    const toDigestItems = (deals: typeof best5) => deals.map(item => {
      const flip = flipMap.get(item.itemId);
      return {
        itemId: item.itemId,
        title: item.title,
        price: item.price,
        marketPrice: item.marketPrice ?? null,
        discountPct: item.discountPct ?? null,
        condition: item.condition,
        imageUrl: item.imageUrl,
        itemUrl: item.itemUrl,
        category: item.category,
        shippingCost: item.shippingCost ?? null,
        flipVerdict: flip?.verdict ?? 'maybe',
        avgSoldPrice: flip?.avgSoldPrice ?? 0,
        soldCount: flip?.soldCount ?? 0,
        flipNetProfit: flip?.netProfit ?? 0,
        flipMarginPct: flip?.marginPct ?? 0,
        estDaysToSell: flip?.estDaysToSell ?? null,
        sourcesCount: flip?.sourcesCount ?? null,
        stockxLastSale: flip?.stockxLastSale ?? null,
        mercariAvgSold: flip?.mercariAvgSold ?? null,
        amazonPrice: flip?.amazonPrice ?? null,
      };
    });
    // Save per-user cache and send push — both use the same personalized deals
    const userMap = new Map(userDigests.map(d => [d.userId, d]));
    await Promise.allSettled(userDigests.map(async ({ userId, deals, aiPick: userAiPick, aiPickItemId: userPickItemId }) => {
      if (!userId) return;
      const cache = { generatedAt: new Date().toISOString(), aiPick: userAiPick ?? null, aiPickItemId: userPickItemId ?? null, items: toDigestItems(deals) };
      await r2Put(`deal-wiz/digest-user-${userId}.json`, JSON.stringify(cache));

      // Record sent item IDs so they won't repeat in future digests (30-day window)
      const prefs = await getUserPrefs(userId);
      const cutoffTs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const existing = (prefs.sentItemIds ?? []).filter(s => new Date(s.sentAt).getTime() > cutoffTs);
      const nowIso = new Date().toISOString();
      const newEntries = deals.map(d => ({ itemId: d.itemId, sentAt: nowIso }));
      prefs.sentItemIds = [...existing, ...newEntries];
      await saveUserPrefs(userId, prefs);
    }));

    // Send push notifications — URL is a spotlight link so tapping opens the specific deal
    const allUsersForPush = await getAllUsers();
    await Promise.allSettled(allUsersForPush.map(async u => {
      try {
        const prefs = await getUserPrefs(u.userId);
        const subs = (prefs.pushSubscriptions as object[] | undefined) ?? [];
        if (!subs.length) return;
        const userDigest = userMap.get(u.userId);
        const topDeal = userDigest?.deals[0] ?? best5[0];
        if (!topDeal) return;
        const topFlip = flipMap.get(topDeal.itemId);
        const body = `${topDeal.title.slice(0, 60)} — $${topDeal.price} (${topDeal.discountPct ?? 0}% off)`;
        const url = buildSpotlightUrl(topDeal, topFlip);
        await sendPushToSubscriptions(subs, "AI FLIP — Daily Deals", body, url).catch(() => {});
      } catch { /* push failure never blocks email */ }
    }));

    // Send SMS to all users with a phone number configured
    const smsUsers = await getAllUsers();
    await Promise.allSettled(smsUsers.map(async u => {
      try {
        const prefs = await getUserPrefs(u.userId);
        if (prefs.notificationPhone) await sendSMSDigest(best5, prefs.notificationPhone, flipMap);
      } catch { /* silent — SMS failure never blocks email */ }
    }));
    const errors = sendResults
      .map((r, i) => r.status === 'rejected' ? `${userDigests[i].email}: ${r.reason}` : null)
      .filter(Boolean);
    const successCount = sendResults.filter(r => r.status === 'fulfilled').length;
    const actualSendCount = userDigests.filter((d, i) => sendResults[i].status === 'fulfilled' && d.deals.length > 0).length;

    if (successCount === 0 || actualSendCount === 0) {
      const hasDeals = userDigests.some(d => d.deals.length > 0);
      const failReason = !hasDeals ? 'No deals to send' : 'All emails failed';
      const failError = errors.length > 0 ? errors[0] : failReason;
      // Only persist state for real cron runs, not force/test runs
      if (!force && !toOverride) {
        await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey(), lastRunResult: 'failed', lastRunDeals: userDigests[0]?.deals.length ?? 0, lastRunError: failError })).catch(() => {});
      }
      return NextResponse.json({ sent: false, reason: failReason, errors });
    }

    // Record send date + success — only for real cron runs, not force/test sends
    const dealCount = userDigests[0]?.deals.length ?? 0;
    if (!force && !toOverride) {
      await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey(), lastRunResult: 'sent', lastRunDeals: dealCount }));
    }

    return NextResponse.json({
      sent: true,
      date: todayKey(),
      recipients: successCount,
      rawItemCount: allItems.length,
      nonRefurbCount: nonRefurb.length,
      aiPick: userDigests[0]?.aiPick ?? null,
      errors: errors.length > 0 ? errors : undefined,
      deals: best5.map(d => ({
        title: d.title,
        price: d.price,
        marketPrice: d.marketPrice,
        discountPct: d.discountPct,
        condition: d.condition,
      })),
    });
  } catch (err) {
    // Return 200 so Vercel does not retry the cron — retries cause duplicate emails
    console.error('[digest] Unhandled error:', err);
    // Persist error so ?check=1 can surface it
    await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey(), lastRunResult: 'error', lastRunError: String(err) })).catch(() => {});
    return NextResponse.json({ sent: false, error: String(err) });
  }
}
