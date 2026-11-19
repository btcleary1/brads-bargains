import { EbayItem } from './ebay';

// Shared scraper for liquidation-auction sites (Mac.bid, Vista Auction). Neither has a documented API, so
// each source lists the endpoints and field names to try; the first that answers with items wins, then
// the homepage's __NEXT_DATA__ is searched as a fallback.

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BAD_CONDITION_RE = /parts\s*only|for\s*parts|broken|cracked|damaged|defective|no\s*power/i;

const CONDITION_KEYS = ['condition', 'grade', 'item_condition', 'conditionGrade', 'condition_name', 'conditionDescription'];
const TITLE_KEYS = ['title', 'name', 'product_name', 'description'];
const LIST_KEYS = ['items', 'results', 'lots', 'data', 'auctions', 'products', 'listings', 'inventory'];
const SOLD_KEYS = ['final_price', 'finalPrice', 'winning_bid', 'winningBid', 'sold_price', 'soldPrice'];
const IMAGE_KEYS = ['image_url', 'imageUrl', 'thumbnail', 'primary_image'];

export interface AuctionSoldResult {
  avgSoldPrice: number;
  soldCount: number;
}

export interface AuctionSource {
  tag: string; // log prefix and item id prefix
  origin: string; // e.g. https://mac.bid
  itemPath: string; // path for an item page when the data has no URL, e.g. /lot/
  seller: string;
  location: string;
  category: string;
  idKeys: string[];
  priceKeys: string[];
  endKeys: string[];
  slugKeys: string[];
  urlKeys: string[];
  categoryKeys: string[];
  soldFallbackKeys: string[]; // price fields used for sold comps when no final price is given
  liveUrls: string[];
  soldUrls: (q: string) => string[];
}

type Raw = Record<string, any>;

const pick = (item: Raw, keys: string[]) => keys.map((k) => item[k]).find((v) => v != null);

function extractItems(data: any): Raw[] {
  if (Array.isArray(data)) return data;
  return pick(data ?? {}, LIST_KEYS) ?? [];
}

function mapItem(src: AuctionSource, item: Raw, index: number): EbayItem | null {
  const condition = pick(item, CONDITION_KEYS) ?? '';
  if (condition && BAD_CONDITION_RE.test(condition)) return null;

  const price = pick(item, src.priceKeys) ?? 0;
  if (!price || Number(price) === 0) return null;

  const title = pick(item, TITLE_KEYS) ?? '';
  if (!title) return null;

  const id = pick(item, src.idKeys) ?? String(index);
  const endTime = pick(item, src.endKeys) ?? null;
  if (endTime && new Date(endTime) < new Date()) return null;
  const listingDate = endTime ?? item.created_at ?? item.createdAt ?? null;

  const urlFromData = pick(item, src.urlKeys) ?? '';
  const itemUrl = urlFromData
    ? (urlFromData.startsWith('http') ? urlFromData : `${src.origin}${urlFromData}`)
    : `${src.origin}${src.itemPath}${String(pick(item, src.slugKeys) ?? '')}`;

  return {
    itemId: `${src.tag}_${String(id)}`,
    title,
    price: Number(price),
    currency: 'USD',
    marketPrice: null,
    discountPct: null,
    condition: condition || 'Unknown',
    imageUrl: pick(item, IMAGE_KEYS) ?? item.images?.[0]?.url ?? item.images?.[0] ?? '',
    additionalImages: [],
    itemUrl,
    seller: src.seller,
    sellerFeedbackScore: null,
    sellerFeedbackPercent: null,
    location: item.location ?? item.warehouse ?? item.city ?? src.location,
    category: pick(item, src.categoryKeys) ?? src.category,
    shippingCost: null,
    localPickupOnly: false,
    listingType: 'AUCTION',
    listingDate: listingDate ? String(listingDate) : null,
    quantity: 1,
  };
}

const mapAll = (src: AuctionSource, items: Raw[]) =>
  items.map((item, i) => mapItem(src, item, i)).filter((x): x is EbayItem => x !== null);

async function tryEndpoint(src: AuctionSource, url: string): Promise<EbayItem[] | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const items = extractItems(await res.json());
    const mapped = mapAll(src, items);
    return mapped.length ? mapped : null;
  } catch {
    return null;
  }
}

async function tryNextData(src: AuctionSource): Promise<EbayItem[] | null> {
  try {
    const res = await fetch(`${src.origin}/`, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const match = (await res.text()).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return null;

    // The largest array of item-shaped objects anywhere in the page data.
    const candidates: Raw[][] = [];
    const walk = (obj: any, depth = 0) => {
      if (depth > 10 || !obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        const first = obj[0];
        if (obj.length > 2 && first && typeof first === 'object' && (first.id || first.lot_id || first.lotId || first.item_id || first.title || first.name)) {
          candidates.push(obj);
        }
        obj.forEach((v) => walk(v, depth + 1));
      } else {
        Object.values(obj).forEach((v) => walk(v, depth + 1));
      }
    };
    walk(JSON.parse(match[1]));

    const best = candidates.sort((a, b) => b.length - a.length)[0];
    if (!best?.length) return null;
    const mapped = mapAll(src, best);
    return mapped.length ? mapped : null;
  } catch {
    return null;
  }
}

export async function fetchAuctionDeals(src: AuctionSource): Promise<EbayItem[]> {
  for (const url of src.liveUrls) {
    const items = await tryEndpoint(src, url);
    if (items?.length) {
      console.log(`[${src.tag}] fetched ${items.length} items via ${url}`);
      return items;
    }
  }
  const fromNext = await tryNextData(src);
  if (fromNext?.length) {
    console.log(`[${src.tag}] fetched ${fromNext.length} items via __NEXT_DATA__`);
    return fromNext;
  }
  console.log(`[${src.tag}] fetched 0 items — all strategies failed`);
  return [];
}

export async function searchAuctionSold(src: AuctionSource, query: string): Promise<AuctionSoldResult | null> {
  if (!query) return null;
  for (const url of src.soldUrls(encodeURIComponent(query))) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const prices = extractItems(await res.json())
        .map((i) => Number(pick(i, [...SOLD_KEYS, ...src.soldFallbackKeys]) ?? 0))
        .filter((p) => p > 0);
      if (prices.length < 2) continue;
      return { avgSoldPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length), soldCount: prices.length };
    } catch {
      continue;
    }
  }
  return null;
}
