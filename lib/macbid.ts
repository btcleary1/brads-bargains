import { EbayItem } from './ebay';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Accept anything that's decent condition — Grade A/B, Like New, Excellent, Open Box, Opened/Never Used
const GOOD_CONDITION_RE = /like[\s-]?new|grade\s*[ab]\b|excellent|open[\s-]?box|likenew|a\s*grade|b\s*grade|never\s*used|sealed|refurb/i;

// Reject clearly damaged items
const BAD_CONDITION_RE = /parts\s*only|for\s*parts|broken|cracked|damaged|defective|no\s*power/i;

function acceptCondition(condition: string | undefined | null): boolean {
  if (!condition) return true; // pass through items with no condition info
  if (BAD_CONDITION_RE.test(condition)) return false;
  return true; // accept anything not explicitly bad
}

function extractItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  return (
    data?.items ??
    data?.results ??
    data?.lots ??
    data?.data ??
    data?.auctions ??
    data?.products ??
    data?.listings ??
    []
  );
}

function mapItem(item: any, index: number): EbayItem | null {
  const condition =
    item.condition ??
    item.grade ??
    item.item_condition ??
    item.conditionGrade ??
    item.condition_name ??
    item.conditionDescription ??
    '';

  if (!acceptCondition(condition)) return null;

  const price =
    item.current_bid ??
    item.currentBid ??
    item.current_price ??
    item.currentPrice ??
    item.startingBid ??
    item.starting_bid ??
    item.price ??
    item.starting_price ??
    item.buy_now_price ??
    item.buyNowPrice ??
    0;

  if (!price || Number(price) === 0) return null;

  const title = item.title ?? item.name ?? item.product_name ?? item.description ?? '';
  if (!title) return null;

  const id = item.id ?? item.lot_id ?? item.lotId ?? item.item_id ?? String(index);

  const endTime =
    item.end_time ?? item.endTime ?? item.ends_at ?? item.endsAt ?? item.closingTime ?? null;
  if (endTime && new Date(endTime) < new Date()) return null;

  const listingDate = endTime ?? item.created_at ?? item.createdAt ?? null;

  const slug = item.slug ?? item.id ?? item.lot_id ?? '';
  const itemUrlFromData = item.url ?? item.item_url ?? item.listing_url ?? '';
  const itemUrl = itemUrlFromData
    ? (itemUrlFromData.startsWith('http') ? itemUrlFromData : `https://mac.bid${itemUrlFromData}`)
    : `https://mac.bid/lot/${String(slug)}`;

  return {
    itemId: 'macbid_' + String(id),
    title,
    price: Number(price),
    currency: 'USD',
    marketPrice: null,
    discountPct: null,
    condition: condition || 'Unknown',
    imageUrl: item.image_url ?? item.imageUrl ?? item.thumbnail ?? item.images?.[0]?.url ?? item.images?.[0] ?? '',
    additionalImages: [],
    itemUrl,
    seller: 'Mac.bid',
    sellerFeedbackScore: null,
    sellerFeedbackPercent: null,
    location: item.location ?? item.warehouse ?? item.city ?? 'SC, US',
    category: item.category ?? item.productType ?? item.product_type ?? item.category_name ?? 'Electronics',
    shippingCost: null,
    localPickupOnly: false,
    listingType: 'AUCTION',
    listingDate: listingDate ? String(listingDate) : null,
    quantity: 1,
  };
}

async function tryEndpoint(url: string): Promise<EbayItem[] | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    console.log(`[macbid] ${url} → ${res.status}`);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      console.log(`[macbid] Non-JSON response (${contentType}) from ${url}`);
      return null;
    }

    const data = await res.json();
    const items = extractItems(data);
    if (!items.length) {
      console.log(`[macbid] Empty items from ${url}. Top-level keys: ${Object.keys(data).join(', ')}`);
      return null;
    }
    console.log(`[macbid] ${items.length} raw items from ${url}. Sample keys: ${Object.keys(items[0] ?? {}).slice(0, 8).join(', ')}`);
    const mapped = items.map((item: any, i: number) => mapItem(item, i)).filter((x): x is EbayItem => x !== null);
    console.log(`[macbid] ${mapped.length} items passed condition/price filter`);
    return mapped.length ? mapped : null;
  } catch (err) {
    console.log(`[macbid] Error fetching ${url}: ${String(err).slice(0, 120)}`);
    return null;
  }
}

async function tryNextData(): Promise<EbayItem[] | null> {
  try {
    const res = await fetch('https://mac.bid/', {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    console.log(`[macbid] homepage → ${res.status}`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) {
      console.log('[macbid] No __NEXT_DATA__ found in homepage HTML');
      return null;
    }

    const nextData = JSON.parse(match[1]);

    const candidates: any[][] = [];
    function walk(obj: any, depth = 0) {
      if (depth > 10 || !obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        if (
          obj.length > 2 &&
          typeof obj[0] === 'object' &&
          obj[0] !== null &&
          (obj[0].id || obj[0].lot_id || obj[0].lotId || obj[0].item_id || obj[0].title || obj[0].name)
        ) {
          candidates.push(obj);
        }
        obj.forEach((v: any) => walk(v, depth + 1));
      } else {
        Object.values(obj).forEach((v) => walk(v, depth + 1));
      }
    }
    walk(nextData);

    const best = candidates.sort((a, b) => b.length - a.length)[0];
    if (!best || !best.length) {
      console.log('[macbid] No candidate item arrays found in __NEXT_DATA__');
      return null;
    }

    console.log(`[macbid] __NEXT_DATA__ best array: ${best.length} items. Sample keys: ${Object.keys(best[0] ?? {}).slice(0, 8).join(', ')}`);
    const mapped = best
      .map((item: any, i: number) => mapItem(item, i))
      .filter((x: EbayItem | null): x is EbayItem => x !== null);
    console.log(`[macbid] ${mapped.length} items from __NEXT_DATA__ after filter`);
    return mapped.length ? mapped : null;
  } catch (err) {
    console.log(`[macbid] __NEXT_DATA__ error: ${String(err).slice(0, 120)}`);
    return null;
  }
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
        const items: any[] = extractItems(data);
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
  const endpoints = [
    'https://mac.bid/api/lots?active=true&per_page=50',
    'https://mac.bid/api/search?query=&active=true&page=1&per_page=50',
    'https://mac.bid/api/lots?status=active&per_page=50',
    'https://mac.bid/api/v1/lots?active=true&per_page=50',
    'https://mac.bid/api/auctions?active=true&per_page=50',
  ];

  for (const url of endpoints) {
    const items = await tryEndpoint(url);
    if (items && items.length > 0) {
      console.log(`[macbid] fetched ${items.length} items via ${url}`);
      return items;
    }
  }

  const fromNext = await tryNextData();
  if (fromNext && fromNext.length > 0) {
    console.log(`[macbid] fetched ${fromNext.length} items via __NEXT_DATA__`);
    return fromNext;
  }

  console.log('[macbid] fetched 0 items — all strategies failed');
  return [];
}
