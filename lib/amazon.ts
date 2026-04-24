// Amazon price lookup via UPC Item DB free search API
// Returns best-effort lowest Amazon price — gracefully returns null if unavailable

const UPCDB_URL = 'https://api.upcitemdb.com/prod/trial/search';

export interface AmazonResult {
  title: string;
  lowestPrice: number;
  highestPrice: number | null;
  asin: string | null;
  url: string | null;
}

export async function searchAmazonPrice(query: string): Promise<AmazonResult | null> {
  if (!query) return null;
  try {
    const url = `${UPCDB_URL}?s=${encodeURIComponent(query)}&type=product`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data?.items ?? [];
    if (items.length === 0) return null;

    // Find item with Amazon offer
    for (const item of items) {
      const offers: any[] = item.offers ?? [];
      const amazon = offers.find((o: any) => o.merchant?.toLowerCase().includes('amazon'));
      if (amazon && amazon.price > 0) {
        return {
          title: item.title ?? query,
          lowestPrice: amazon.price,
          highestPrice: amazon.price,
          asin: item.asin ?? null,
          url: amazon.link ?? (item.asin ? `https://www.amazon.com/dp/${item.asin}` : null),
        };
      }
      // Fall back to any offer with a price
      if (offers.length > 0) {
        const prices = offers.map((o: any) => o.price).filter((p: number) => p > 0);
        if (prices.length > 0) {
          return {
            title: item.title ?? query,
            lowestPrice: Math.min(...prices),
            highestPrice: Math.max(...prices),
            asin: item.asin ?? null,
            url: item.asin ? `https://www.amazon.com/dp/${item.asin}` : null,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
