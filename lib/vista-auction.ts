import { EbayItem } from './ebay';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Reject clearly damaged items
const BAD_CONDITION_RE = /parts\s*only|for\s*parts|broken|cracked|damaged|defective|no\s*power/i;

function acceptCondition(condition: string | undefined | null): boolean {
  if (!condition) return true; // pass through items with no condition info
  if (BAD_CONDITION_RE.test(condition)) return false;
  return true;
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
    data?.inventory ??
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
    item.retail_price ??
    0;

  if (!price || Number(price) === 0) return null;

  const title = item.title ?? item.name ?? item.product_name ?? item.description ?? '';
  if (!title) return null;

  const id =
    item.id ??
    item.lot_id ??
    item.lotId ??
    item.item_id ??
    item.itemId ??
    String(index);

  const endTime =
    item.end_time ??
    item.endTime ??
    item.ends_at ??
    item.endsAt ??
    item.auction_end ??
    item.closing_time ??
    null;
  if (endTime && new Date(endTime) < new Date()) return null;

  const listingDate = endTime ?? item.created_at ?? item.createdAt ?? null;

  const slug = item.slug ?? item.id ?? item.item_id ?? '';
  const itemUrlFromData = item.url ?? item.item_url ?? item.link ?? item.listing_url ?? '';
  const itemUrl = itemUrlFromData
    ? (itemUrlFromData.startsWith('http') ? itemUrlFromData : `https://www.vistaauctions.com${itemUrlFromData}`)
    : `https://www.vistaauctions.com/items/${String(slug)}`;

  return {
    itemId: 'vista_' + String(id),
    title,
    price: Number(price),
    currency: 'USD',
    marketPrice: null,
    discountPct: null,
    condition: condition || 'Unknown',
    imageUrl:
      item.image_url ??
      item.imageUrl ??
      item.thumbnail ??
      item.primary_image ??
      item.images?.[0]?.url ??
      item.images?.[0] ??
      '',
    additionalImages: [],
    itemUrl,
    seller: 'Vista Auction',
    sellerFeedbackScore: null,
    sellerFeedbackPercent: null,
    location: item.location ?? item.warehouse ?? item.city ?? 'US',
    category:
      item.category ??
      item.category_name ??
      item.productType ??
      item.product_type ??
      'General',
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
    console.log(`[vista] ${url} → ${res.status}`);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      console.log(`[vista] Non-JSON response (${contentType}) from ${url}`);
      return null;
    }

    const data = await res.json();
    const items = extractItems(data);
    if (!items.length) {
      console.log(`[vista] Empty items from ${url}. Top-level keys: ${Object.keys(data).join(', ')}`);
      return null;
    }
    console.log(`[vista] ${items.length} raw items from ${url}. Sample keys: ${Object.keys(items[0] ?? {}).slice(0, 8).join(', ')}`);
    const mapped = items.map((item: any, i: number) => mapItem(item, i)).filter((x): x is EbayItem => x !== null);
    console.log(`[vista] ${mapped.length} items passed filter`);
    return mapped.length ? mapped : null;
  } catch (err) {
    console.log(`[vista] Error fetching ${url}: ${String(err).slice(0, 120)}`);
    return null;
  }
}

async function tryNextData(): Promise<EbayItem[] | null> {
  try {
    const res = await fetch('https://www.vistaauctions.com/', {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    console.log(`[vista] homepage → ${res.status}`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) {
      console.log('[vista] No __NEXT_DATA__ in homepage HTML — not a Next.js app or data not inline');
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
          (obj[0].id || obj[0].lot_id || obj[0].item_id || obj[0].title || obj[0].name)
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
      console.log('[vista] No candidate item arrays in __NEXT_DATA__');
      return null;
    }

    console.log(`[vista] __NEXT_DATA__ best array: ${best.length} items. Sample keys: ${Object.keys(best[0] ?? {}).slice(0, 8).join(', ')}`);
    const mapped = best
      .map((item: any, i: number) => mapItem(item, i))
      .filter((x: EbayItem | null): x is EbayItem => x !== null);
    console.log(`[vista] ${mapped.length} items from __NEXT_DATA__ after filter`);
    return mapped.length ? mapped : null;
  } catch (err) {
    console.log(`[vista] __NEXT_DATA__ error: ${String(err).slice(0, 120)}`);
    return null;
  }
}

export interface AuctionSoldResult {
  avgSoldPrice: number;
  soldCount: number;
}

export async function searchVistaAuctionSold(query: string): Promise<AuctionSoldResult | null> {
  if (!query) return null;
  try {
    const q = encodeURIComponent(query);
    const endpoints = [
      `https://www.vistaauctions.com/api/items?query=${q}&status=sold&per_page=20`,
      `https://www.vistaauctions.com/api/lots?query=${q}&status=ended&per_page=20`,
      `https://www.vistaauctions.com/api/search?q=${q}&status=completed&limit=20`,
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
          .map(i => Number(i.final_price ?? i.finalPrice ?? i.winning_bid ?? i.winningBid ?? i.sold_price ?? i.soldPrice ?? i.current_price ?? i.currentPrice ?? 0))
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

export async function fetchVistaAuctionDeals(): Promise<EbayItem[]> {
  const endpoints = [
    'https://www.vistaauctions.com/api/items?status=active&per_page=50',
    'https://www.vistaauctions.com/api/lots?active=true&per_page=50',
    'https://www.vistaauctions.com/api/items?condition=like_new&status=active',
    'https://www.vistaauctions.com/api/search?status=active&limit=50',
    'https://www.vistaauctions.com/api/v1/items?active=true&per_page=50',
  ];

  for (const url of endpoints) {
    const items = await tryEndpoint(url);
    if (items && items.length > 0) {
      console.log(`[vista] fetched ${items.length} items via ${url}`);
      return items;
    }
  }

  const fromNext = await tryNextData();
  if (fromNext && fromNext.length > 0) {
    console.log(`[vista] fetched ${fromNext.length} items via __NEXT_DATA__`);
    return fromNext;
  }

  console.log('[vista] fetched 0 items — all strategies failed');
  return [];
}
