import { getEbayToken } from './ebay';

const EBAY_API_BASE = 'https://api.ebay.com';

export interface SoldComp {
  title: string;
  soldPrice: number;
  condition: string;
  soldDate: string | null;
}

export interface CompsResult {
  comps: SoldComp[];
  avgSoldPrice: number;
  medianSoldPrice: number;
  minSoldPrice: number;
  maxSoldPrice: number;
  count: number;
}

function parsePrice(priceObj: any): number {
  return parseFloat(priceObj?.value ?? '0');
}

export async function searchSoldComps(query: string, maxResults = 20): Promise<CompsResult> {
  const token = await getEbayToken();

  const params = new URLSearchParams({
    q: query,
    limit: String(maxResults),
    sort: 'endDateDesc',
  });
  const url = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params}&filter=soldItems:true,buyingOptions:{FIXED_PRICE},priceCurrency:USD`;

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
    throw new Error(`eBay sold comps search failed: ${text}`);
  }

  const data = await res.json();
  const items: SoldComp[] = (data.itemSummaries ?? []).map((raw: any) => ({
    title: raw.title ?? '',
    soldPrice: parsePrice(raw.price),
    condition: raw.condition ?? 'Unknown',
    soldDate: raw.itemEndDate ?? raw.itemCreationDate ?? null,
  })).filter((i: SoldComp) => i.soldPrice > 0);

  if (items.length === 0) return { comps: [], avgSoldPrice: 0, medianSoldPrice: 0, minSoldPrice: 0, maxSoldPrice: 0, count: 0 };

  const prices = items.map(i => i.soldPrice).sort((a, b) => a - b);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return {
    comps: items,
    avgSoldPrice: Math.round(avg * 100) / 100,
    medianSoldPrice: Math.round(median * 100) / 100,
    minSoldPrice: prices[0],
    maxSoldPrice: prices[prices.length - 1],
    count: items.length,
  };
}
