// Mercari US price search
// Tries sold items first, falls back to active listings as a market price proxy

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface MercariResult {
  avgSoldPrice: number;
  soldCount: number;
  minPrice: number;
  maxPrice: number;
}

async function fetchMercari(query: string, statusFilter: string, limit: number): Promise<MercariResult | null> {
  const res = await fetch('https://api.mercari.com/v2/entities:search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Platform': 'web',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.mercari.com',
      'Referer': 'https://www.mercari.com/',
      'User-Agent': BROWSER_UA,
      'DPoP': 'v=1',
    },
    body: JSON.stringify({
      pageToken: '',
      pageSize: limit,
      searchIndexes: ['us_mercari'],
      searchSessionId: Date.now().toString(36),
      query,
      facets: [],
      numericFilters: statusFilter,
      defaultDataView: 'GRID',
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;
  const data = await res.json();

  // API returns items under result[] or items[], each with price or selling_price
  const items: any[] = data?.result ?? data?.items ?? data?.data?.items ?? [];
  if (items.length === 0) return null;

  const prices = items
    .map((i: any) => {
      const raw = i?.price ?? i?.selling_price ?? i?.item?.price ?? 0;
      return typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    })
    .filter(p => p > 10); // filter out $0 and junk prices

  if (prices.length === 0) return null;

  return {
    avgSoldPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    soldCount: prices.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  };
}

export async function searchMercariSold(query: string, limit = 10): Promise<MercariResult | null> {
  if (!query) return null;
  try {
    // Try sold items first
    const sold = await fetchMercari(query, 'status=sold_out', limit).catch(() => null);
    if (sold && sold.soldCount >= 2) return sold;

    // Fall back to active listings — good market price proxy when sold history unavailable
    const active = await fetchMercari(query, 'status=on_sale', limit).catch(() => null);
    if (active && active.soldCount >= 2) return active;

    return null;
  } catch {
    return null;
  }
}
