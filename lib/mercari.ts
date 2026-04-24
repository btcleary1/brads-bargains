// Mercari US sold item price search
// Uses their public search API — gracefully returns null if unavailable

const MERCARI_SEARCH_URL = 'https://api.mercari.com/v2/entities:search';

export interface MercariResult {
  avgSoldPrice: number;
  soldCount: number;
  minPrice: number;
  maxPrice: number;
}

export async function searchMercariSold(query: string, limit = 10): Promise<MercariResult | null> {
  if (!query) return null;
  try {
    const res = await fetch(MERCARI_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': 'web',
        'Accept': 'application/json',
        'Origin': 'https://www.mercari.com',
        'Referer': 'https://www.mercari.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        pageToken: '',
        pageSize: limit,
        searchIndexes: ['us_mercari'],
        searchSessionId: Math.random().toString(36).slice(2),
        query,
        facets: [],
        numericFilters: 'status=sold_out',
        defaultDataView: 'GRID',
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data?.result ?? data?.items ?? [];
    if (items.length === 0) return null;

    const prices = items
      .map((i: any) => parseFloat(i.price ?? i.selling_price ?? '0'))
      .filter(p => p > 0);

    if (prices.length === 0) return null;

    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    return {
      avgSoldPrice: avg,
      soldCount: prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    };
  } catch {
    return null;
  }
}
