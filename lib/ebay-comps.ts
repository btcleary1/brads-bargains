import { getEbayToken, parsePrice } from './ebay';

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
  estDaysToSell: number | null;
}

// Average days between sales = how fast a buyer appears. Requires 2+ dated comps.
function computeDaysToSell(comps: SoldComp[]): number | null {
  const dates = comps
    .map(c => c.soldDate ? new Date(c.soldDate).getTime() : null)
    .filter((d): d is number => d !== null && !isNaN(d))
    .sort((a, b) => a - b);
  if (dates.length < 2) return null;
  const rangeDays = (dates[dates.length - 1] - dates[0]) / 86_400_000;
  const avg = rangeDays / (dates.length - 1);
  return Math.min(60, Math.max(1, Math.round(avg)));
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
  const rawItems: SoldComp[] = (data.itemSummaries ?? []).map((raw: any) => ({
    title: raw.title ?? '',
    soldPrice: parsePrice(raw.price),
    condition: raw.condition ?? 'Unknown',
    soldDate: raw.itemEndDate ?? raw.itemCreationDate ?? null,
  })).filter((i: SoldComp) => i.soldPrice > 0);

  if (rawItems.length === 0) return { comps: [], avgSoldPrice: 0, medianSoldPrice: 0, minSoldPrice: 0, maxSoldPrice: 0, count: 0, estDaysToSell: null };

  // Filter comps by title similarity — require ≥40% of query tokens to appear in comp title.
  // Prevents a broad query from mixing in unrelated items (e.g. real bullion coins vs gilded novelties).
  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  const items = queryTokens.length >= 4
    ? (() => {
        const filtered = rawItems.filter(comp => {
          const compLower = comp.title.toLowerCase();
          const matches = queryTokens.filter(t => compLower.includes(t)).length;
          return matches / queryTokens.length >= 0.40;
        });
        return filtered.length >= 2 ? filtered : rawItems; // fallback if filter is too aggressive
      })()
    : rawItems;

  // IQR-based outlier removal — eliminates graded/certified outliers skewing the mean.
  // Only applied when we have enough comps to compute a meaningful IQR.
  function iqrTrimmed(prices: number[]): number[] {
    if (prices.length < 6) return prices;
    const sorted = [...prices].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    if (iqr === 0) return prices;
    return sorted.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  }

  const allPrices = items.map(i => i.soldPrice).sort((a, b) => a - b);
  const trimmedPrices = iqrTrimmed(allPrices);
  const avg = trimmedPrices.reduce((s, p) => s + p, 0) / trimmedPrices.length;
  const mid = Math.floor(trimmedPrices.length / 2);
  const median = trimmedPrices.length % 2 === 0
    ? (trimmedPrices[mid - 1] + trimmedPrices[mid]) / 2
    : trimmedPrices[mid];

  return {
    comps: items,
    avgSoldPrice: Math.round(avg * 100) / 100,
    medianSoldPrice: Math.round(median * 100) / 100,
    minSoldPrice: allPrices[0],
    maxSoldPrice: allPrices[allPrices.length - 1],
    count: items.length,
    estDaysToSell: computeDaysToSell(items),
  };
}
