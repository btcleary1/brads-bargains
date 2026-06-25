import { EbayItem } from './ebay';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const LIKE_NEW_PATTERNS = /like[\s-]?new|grade\s*a\b|excellent|a\s*grade|likenew/i;

function isLikeNew(condition: string | undefined | null): boolean {
  if (!condition) return false;
  return LIKE_NEW_PATTERNS.test(condition);
}

function mapItem(item: any, index: number): EbayItem | null {
  const condition =
    item.condition ??
    item.grade ??
    item.item_condition ??
    item.conditionGrade ??
    '';

  if (!isLikeNew(condition)) return null;

  const price =
    item.current_bid ??
    item.currentBid ??
    item.startingBid ??
    item.starting_bid ??
    item.price ??
    item.starting_price ??
    0;

  if (!price || Number(price) === 0) return null;

  const id = item.id ?? item.lot_id ?? item.lotId ?? String(index);

  const endTime =
    item.end_time ?? item.endTime ?? item.ends_at ?? item.endsAt ?? null;
  if (endTime && new Date(endTime) < new Date()) return null;

  const listingDate =
    item.end_time ??
    item.endTime ??
    item.ends_at ??
    item.endsAt ??
    item.created_at ??
    item.createdAt ??
    null;

  const slug = item.slug ?? item.id ?? '';

  return {
    itemId: 'macbid_' + String(id),
    title: item.title ?? item.name ?? item.product_name ?? 'Unknown',
    price: Number(price),
    currency: 'USD',
    marketPrice: null,
    discountPct: null,
    condition: 'Like New',
    imageUrl: item.image_url ?? item.imageUrl ?? item.images?.[0] ?? '',
    additionalImages: [],
    itemUrl: 'https://mac.bid/' + String(slug),
    seller: 'Mac.bid',
    sellerFeedbackScore: null,
    sellerFeedbackPercent: null,
    location: item.location ?? item.warehouse ?? 'SC, US',
    category:
      item.category ?? item.productType ?? item.product_type ?? 'Electronics',
    shippingCost: null,
    localPickupOnly: false,
    listingType: 'AUCTION',
    listingDate: listingDate ? String(listingDate) : null,
    quantity: 1,
  };
}

async function trySearchApi(): Promise<EbayItem[] | null> {
  const url =
    'https://mac.bid/api/search?query=&type=&active=true&page=1&per_page=50';
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items: any[] =
    data.items ??
    data.results ??
    data.lots ??
    data.data ??
    (Array.isArray(data) ? data : []);
  if (!items.length) return null;
  return items
    .map((item, i) => mapItem(item, i))
    .filter((x): x is EbayItem => x !== null);
}

async function tryLotsApi(): Promise<EbayItem[] | null> {
  const url =
    'https://mac.bid/api/lots?active=true&condition=Like+New&per_page=48';
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items: any[] =
    data.items ??
    data.results ??
    data.lots ??
    data.data ??
    (Array.isArray(data) ? data : []);
  if (!items.length) return null;
  return items
    .map((item, i) => mapItem(item, i))
    .filter((x): x is EbayItem => x !== null);
}

async function tryNextData(): Promise<EbayItem[] | null> {
  const res = await fetch('https://mac.bid/', {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  const nextData = JSON.parse(match[1]);

  // Walk the object tree to find arrays of lot/item objects
  const candidates: any[][] = [];
  function walk(obj: any, depth = 0) {
    if (depth > 6 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      if (
        obj.length > 0 &&
        typeof obj[0] === 'object' &&
        (obj[0].id || obj[0].lot_id || obj[0].title)
      ) {
        candidates.push(obj);
      }
      obj.forEach((v: any) => walk(v, depth + 1));
    } else {
      Object.values(obj).forEach((v) => walk(v, depth + 1));
    }
  }
  walk(nextData);

  // Use the largest candidate array
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  if (!best || !best.length) return null;
  return best
    .map((item: any, i: number) => mapItem(item, i))
    .filter((x: EbayItem | null): x is EbayItem => x !== null);
}

export interface AuctionSoldResult {
  avgSoldPrice: number;
  soldCount: number;
}

export async function searchMacBidSold(query: string): Promise<AuctionSoldResult | null> {
  if (!query) return null;
  try {
    const q = encodeURIComponent(query);
    const endpoints = [
      `https://mac.bid/api/search?query=${q}&status=ended&per_page=20`,
      `https://mac.bid/api/lots?query=${q}&status=completed&per_page=20`,
      `https://mac.bid/api/search?query=${q}&active=false&per_page=20`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const items: any[] = data.items ?? data.results ?? data.lots ?? data.data ?? (Array.isArray(data) ? data : []);
        if (!items.length) continue;
        const prices = items
          .map(i => Number(i.final_price ?? i.finalPrice ?? i.winning_bid ?? i.winningBid ?? i.sold_price ?? i.soldPrice ?? i.current_bid ?? i.currentBid ?? 0))
          .filter(p => p > 0);
        if (prices.length < 2) continue;
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        return { avgSoldPrice: avg, soldCount: prices.length };
      } catch { continue; }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchMacBidDeals(): Promise<EbayItem[]> {
  try {
    const fromSearch = await trySearchApi().catch(() => null);
    if (fromSearch && fromSearch.length > 0) {
      console.log(`[macbid] fetched ${fromSearch.length} items`);
      return fromSearch;
    }

    const fromLots = await tryLotsApi().catch(() => null);
    if (fromLots && fromLots.length > 0) {
      console.log(`[macbid] fetched ${fromLots.length} items`);
      return fromLots;
    }

    const fromNext = await tryNextData().catch(() => null);
    if (fromNext && fromNext.length > 0) {
      console.log(`[macbid] fetched ${fromNext.length} items`);
      return fromNext;
    }

    console.log('[macbid] fetched 0 items');
    return [];
  } catch {
    console.log('[macbid] fetched 0 items');
    return [];
  }
}
