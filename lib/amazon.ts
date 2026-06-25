// Amazon price lookup
// Uses the Rainforest API if RAINFOREST_API_KEY is set, otherwise skips gracefully.
// Free-tier fallback: parses Google Shopping snippet for an Amazon price.

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface AmazonResult {
  title: string;
  lowestPrice: number;
  highestPrice: number | null;
  asin: string | null;
  url: string | null;
}

async function tryRainforestApi(query: string): Promise<AmazonResult | null> {
  const key = process.env.RAINFOREST_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.rainforestapi.com/request?api_key=${key}&type=search&amazon_domain=amazon.com&search_term=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.search_results?.[0];
    if (!item || !item.price?.value) return null;
    return {
      title: item.title ?? query,
      lowestPrice: item.price.value,
      highestPrice: item.price.value,
      asin: item.asin ?? null,
      url: item.link ?? (item.asin ? `https://www.amazon.com/dp/${item.asin}` : null),
    };
  } catch {
    return null;
  }
}

async function tryGoogleShopping(query: string): Promise<AmazonResult | null> {
  // Fetch Google Shopping results and look for Amazon-sourced prices in the page
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query + ' site:amazon.com')}&tbm=shop`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract price from structured data or price patterns near "amazon.com"
    const priceMatch = html.match(/amazon\.com[^$]*?\$\s*(\d{1,4}(?:[.,]\d{2})?)/i)
      ?? html.match(/\$\s*(\d{1,4}(?:[.,]\d{2})?)[^0-9]*amazon/i);
    if (!priceMatch) return null;

    const price = parseFloat(priceMatch[1].replace(',', ''));
    if (!price || price <= 0) return null;

    return {
      title: query,
      lowestPrice: price,
      highestPrice: price,
      asin: null,
      url: null,
    };
  } catch {
    return null;
  }
}

export async function searchAmazonPrice(query: string): Promise<AmazonResult | null> {
  if (!query) return null;

  // Rainforest API (paid, reliable) — set RAINFOREST_API_KEY in Vercel env vars
  const rainforest = await tryRainforestApi(query);
  if (rainforest) return rainforest;

  // Google Shopping fallback — free but rate-limited and fragile
  const google = await tryGoogleShopping(query);
  if (google) return google;

  return null;
}
