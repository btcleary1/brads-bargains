// eBay Browse API client — uses OAuth 2.0 Client Credentials (application token)

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_SANDBOX_BASE = 'https://api.sandbox.ebay.com';

function base(): string {
  return process.env.EBAY_SANDBOX === 'true' ? EBAY_SANDBOX_BASE : EBAY_API_BASE;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getEbayToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${base()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay OAuth failed: ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export interface EbayItem {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  additionalImages: string[];
  itemUrl: string;
  seller: string;
  sellerFeedbackScore: number | null;
  sellerFeedbackPercent: number | null;
  location: string;
  category: string;
  shippingCost: number | null;
  localPickupOnly: boolean;
  listingType: string;
  listingDate: string | null; // ISO date when item was listed
  quantity: number | null;    // how many the seller has available
}

function parsePrice(priceObj: any): number {
  return parseFloat(priceObj?.value ?? '0');
}

// Build a reliable item URL — itemWebUrl from sandbox keys returns broken sandbox URLs.
// Fall back to constructing a real ebay.com URL from the legacy item ID.
// Browse API itemId format: "v1|123456789|0" — middle segment is the legacy item ID.
function buildItemUrl(itemWebUrl: string, itemId: string): string {
  const isSandboxUrl = itemWebUrl.includes('sandbox.ebay') || itemWebUrl.includes('ebay.com/itm/sandbox');
  if (itemWebUrl && !isSandboxUrl) return itemWebUrl;
  const legacyId = itemId?.split('|')[1] ?? itemId;
  return legacyId ? `https://www.ebay.com/itm/${legacyId}` : '';
}

function toEbayItem(raw: any): EbayItem {
  const price = parsePrice(raw.price);
  // Browse API uses marketingPrice.originalPrice (not marketPrice)
  const marketPrice = raw.marketingPrice?.originalPrice
    ? parsePrice(raw.marketingPrice.originalPrice)
    : raw.marketPrice
    ? parsePrice(raw.marketPrice)
    : null;
  const discountPct = raw.marketingPrice?.discountPercentage
    ? Math.round(parseFloat(raw.marketingPrice.discountPercentage))
    : marketPrice && marketPrice > 0
    ? Math.round(((marketPrice - price) / marketPrice) * 100)
    : null;

  return {
    itemId: raw.itemId,
    title: raw.title,
    price,
    currency: raw.price?.currency ?? 'USD',
    marketPrice,
    discountPct,
    condition: raw.condition ?? 'Unknown',
    imageUrl: raw.image?.imageUrl ?? '',
    additionalImages: (raw.additionalImages ?? []).map((i: any) => i.imageUrl).filter(Boolean),
    itemUrl: buildItemUrl(raw.itemWebUrl ?? '', raw.itemId ?? ''),
    seller: raw.seller?.username ?? '',
    sellerFeedbackScore: raw.seller?.feedbackScore ?? null,
    sellerFeedbackPercent: raw.seller?.feedbackPercentage ? parseFloat(raw.seller.feedbackPercentage) : null,
    location: raw.itemLocation?.city
      ? `${raw.itemLocation.city}, ${raw.itemLocation.stateOrProvince ?? ''}`
      : (raw.itemLocation?.country ?? ''),
    category: raw.categories?.[0]?.categoryName ?? '',
    shippingCost: raw.shippingOptions?.[0]?.shippingCost
      ? parsePrice(raw.shippingOptions[0].shippingCost)
      : null,
    localPickupOnly: (
      (Array.isArray(raw.buyingOptions) && raw.buyingOptions.includes('LOCAL_PICKUP')) ||
      /local\s*pick.?up/i.test(raw.title ?? '') ||
      (!raw.shippingOptions || raw.shippingOptions.length === 0) ||
      (raw.shippingOptions?.length > 0 && raw.shippingOptions.every((s: any) => s.shippingServiceCode === 'LOCAL_PICKUP' || s.shippingCostType === 'NOT_SPECIFIED'))
    ),
    listingType: raw.buyingOptions?.[0] ?? 'FIXED_PRICE',
    listingDate: raw.itemCreationDate ?? null,
    quantity: raw.estimatedAvailabilities?.[0]?.estimatedAvailableQuantity ?? null,
  };
}

export async function searchDeals(query: string, maxResults = 20, categoryId?: string): Promise<EbayItem[]> {
  const token = await getEbayToken();

  // Build base params without filter (URLSearchParams encodes {|} which breaks eBay filter syntax)
  const paramObj: Record<string, string> = {
    q: query,
    limit: String(maxResults),
    sort: 'bestMatch',
  };
  if (categoryId) paramObj.category_ids = categoryId;
  const params = new URLSearchParams(paramObj);
  // Append filter unencoded — eBay requires literal {|} characters
  // Condition IDs: 1000=New, 1500=Open Box, 3000=Used, 4000=Very Good, 5000=Good
  // Excludes refurbished (2000-2500 range)
  const url = `${base()}/buy/browse/v1/item_summary/search?${params}&filter=buyingOptions:{FIXED_PRICE},priceCurrency:USD,conditionIds:{1000|1500|3000|4000|5000}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay search failed: ${text}`);
  }

  const data = await res.json();
  const items: EbayItem[] = (data.itemSummaries ?? []).map(toEbayItem);
  return items;
}

// Filter items to only those still live — Mac.bid/Vista auction items pass through unchecked
export async function filterLiveItems(items: EbayItem[]): Promise<EbayItem[]> {
  const auctionItems = items.filter(i => i.itemId.startsWith('macbid_') || i.itemId.startsWith('vista_'));
  const ebayItems = items.filter(i => !i.itemId.startsWith('macbid_') && !i.itemId.startsWith('vista_'));
  if (ebayItems.length === 0) return auctionItems;
  const results = await Promise.allSettled(ebayItems.map(item => getItemDetail(item.itemId)));
  const liveEbay = ebayItems.filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<EbayItem | null>).value !== null);
  return [...auctionItems, ...liveEbay];
}

export async function getItemDetail(itemId: string): Promise<EbayItem | null> {
  const token = await getEbayToken();

  const res = await fetch(`${base()}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const raw = await res.json();
  return toEbayItem(raw);
}
