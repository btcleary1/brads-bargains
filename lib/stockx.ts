// StockX market data via Algolia search (public search-only credentials)
// Returns best-effort data — gracefully returns null if blocked or unavailable

const ALGOLIA_APP_ID = 'XW7SBCT9V6';
const ALGOLIA_SEARCH_KEY = '6b5e76b8de8bf9f8d7f4c09a726c1c5f';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products/query`;

export interface StockXResult {
  name: string;
  lastSalePrice: number;
  lowestAsk: number | null;
  highestBid: number | null;
  retailPrice: number | null;
  salesLast72Hours: number | null;
  volatility: number | null;
}

export async function searchStockX(query: string): Promise<StockXResult | null> {
  if (!query) return null;
  try {
    const res = await fetch(ALGOLIA_URL, {
      method: 'POST',
      headers: {
        'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ params: `query=${encodeURIComponent(query)}&hitsPerPage=3` }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.hits?.[0];
    if (!hit) return null;

    const market = hit.market ?? {};
    return {
      name: hit.title ?? hit.name ?? query,
      lastSalePrice: market.lastSale ?? market.lastSalePrice ?? 0,
      lowestAsk: market.lowestAsk ?? null,
      highestBid: market.highestBid ?? null,
      retailPrice: hit.retailPrice ?? null,
      salesLast72Hours: market.salesLast72Hours ?? null,
      volatility: market.deadstockSold ?? null,
    };
  } catch {
    return null;
  }
}
