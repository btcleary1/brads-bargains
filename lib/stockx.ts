// StockX market data
// Primary: Algolia public search (when credentials are valid)
// Fallback: Google Shopping scrape for last-sale price signals

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Public search-only Algolia credentials for StockX — may rotate; fallback handles expiry
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

async function tryAlgolia(query: string): Promise<StockXResult | null> {
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
    const lastSale = market.lastSale ?? market.lastSalePrice ?? 0;
    if (!lastSale || lastSale <= 0) return null;

    return {
      name: hit.title ?? hit.name ?? query,
      lastSalePrice: lastSale,
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

async function tryGoogleShopping(query: string): Promise<StockXResult | null> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query + ' site:stockx.com')}&tbm=shop`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract price near stockx.com mentions
    const priceMatch = html.match(/stockx\.com[^$]*?\$\s*(\d{1,4}(?:[.,]\d{2})?)/i)
      ?? html.match(/\$\s*(\d{1,4}(?:[.,]\d{2})?)[^0-9]*stockx/i);
    if (!priceMatch) return null;

    const price = parseFloat(priceMatch[1].replace(',', ''));
    if (!price || price <= 0) return null;

    return {
      name: query,
      lastSalePrice: price,
      lowestAsk: null,
      highestBid: null,
      retailPrice: null,
      salesLast72Hours: null,
      volatility: null,
    };
  } catch {
    return null;
  }
}

export async function searchStockX(query: string): Promise<StockXResult | null> {
  if (!query) return null;

  const algolia = await tryAlgolia(query);
  if (algolia) return algolia;

  // Algolia credentials expired — fall back to Google Shopping
  return tryGoogleShopping(query);
}
