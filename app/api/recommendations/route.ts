import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getEbayUserTokens, saveEbayUserTokens, getUserPrefs } from '@/lib/tracker-data';
import { getEbayPurchaseHistory, refreshEbayUserToken, extractSearchKeywords } from '@/lib/ebay-user';
import { searchDeals } from '@/lib/ebay';
import { isJunk, topDeals } from '@/lib/deal-score';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { checkRequestLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 5 fetches per 5 minutes — recommendations are cached client-side per session
  try { await checkRequestLimit(session.userId, 'recommendations', 5, 300_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  let tokens = await getEbayUserTokens(session.userId);

  if (!tokens || Date.now() > tokens.refreshExpiresAt) {
    return NextResponse.json({ connected: false, recommendations: [] });
  }

  // Refresh access token if within 60s of expiry
  if (Date.now() > tokens.expiresAt - 60_000) {
    try {
      const refreshed = await refreshEbayUserToken(tokens.refreshToken);
      tokens = { ...tokens, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
      await saveEbayUserTokens(session.userId, tokens);
    } catch {
      return NextResponse.json({ connected: false, recommendations: [], tokenError: true });
    }
  }

  const prefs = await getUserPrefs(session.userId);
  const filterPrefs = { ...(prefs.filterPrefs ?? {}), showLocalPickup: prefs.showLocalPickup ?? false };

  // Fetch purchase history
  let keywords: string[] = [];
  try {
    const purchases = await getEbayPurchaseHistory(tokens.accessToken);
    keywords = extractSearchKeywords(purchases);
  } catch (err) {
    console.error('Purchase history fetch failed:', err);
  }

  // Fall back to watchlist or default categories if history is empty
  let isDefaultFallback = false;
  if (keywords.length === 0) {
    if (prefs.watchlistQueries?.length) {
      keywords = prefs.watchlistQueries.slice(0, 4);
    } else {
      keywords = ['iPhone', 'MacBook', 'PlayStation 5', 'Nintendo Switch'];
      isDefaultFallback = true;
    }
  }
  const isMock = process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID;

  // Search for deals across the top keywords (parallel, cap at 3 to stay fast)
  const searchTerms = keywords.slice(0, 3);
  const rawResults = await Promise.allSettled(
    searchTerms.map(kw =>
      isMock
        ? Promise.resolve(MOCK_DEALS.filter(i => i.title.toLowerCase().includes(kw.toLowerCase())))
        : searchDeals(kw, 20)
    )
  );

  const allItems = rawResults
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    // Deduplicate by itemId
    .filter((item, idx, arr) => arr.findIndex(i => i.itemId === item.itemId) === idx);

  const filtered = allItems.filter(i => !isJunk(i, filterPrefs));
  const top = topDeals(filtered, 12, filterPrefs?.minDiscountPct ?? 50, filterPrefs);

  return NextResponse.json({
    connected: true,
    keywords,
    isDefaultFallback,
    recommendations: top.map(item => ({
      ...item,
      isHotDeal: item.discountPct !== null && item.discountPct >= (filterPrefs?.minDiscountPct ?? 50),
    })),
  });
}
