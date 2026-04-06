import { put, head } from '@vercel/blob';

const PREFIX = 'deal-wiz';

async function readBlob<T>(path: string): Promise<T | null> {
  try {
    const blob = await head(path);
    if (!blob) return null;
    const res = await fetch(blob.downloadUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function writeBlob(path: string, data: unknown): Promise<void> {
  await put(path, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

// ── Deal / Tracker item ──────────────────────────────────────────────────────

export type DealStatus = 'watching' | 'purchased' | 'listed' | 'sold';

export interface TrackerDeal {
  id: string;
  // eBay source
  ebayItemId: string;
  title: string;
  ebayPrice: number;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  additionalImages: string[];
  ebayUrl: string;
  category: string;
  // Tracker
  status: DealStatus;
  purchasedAt: string | null;
  sellTargetPrice: number | null;
  sellActualPrice: number | null;
  soldAt: string | null;
  shippingCost: number | null;
  notes: string;
  // Listing draft
  listingDraft: string | null;
  createdAt: string;
}

export async function getDeals(userId: string): Promise<TrackerDeal[]> {
  return (await readBlob<TrackerDeal[]>(`${PREFIX}/${userId}/deals.json`)) ?? [];
}

export async function saveDeals(userId: string, deals: TrackerDeal[]): Promise<void> {
  await writeBlob(`${PREFIX}/${userId}/deals.json`, deals);
}

// ── Saved searches ───────────────────────────────────────────────────────────

export interface SavedSearch {
  id: string;
  query: string;
  minDiscount: number;
  createdAt: string;
  lastRunAt: string | null;
}

export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  return (await readBlob<SavedSearch[]>(`${PREFIX}/${userId}/searches.json`)) ?? [];
}

export async function saveSavedSearches(userId: string, searches: SavedSearch[]): Promise<void> {
  await writeBlob(`${PREFIX}/${userId}/searches.json`, searches);
}
