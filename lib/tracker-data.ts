import { r2Get, r2Put } from './r2';

const PREFIX = 'deal-wiz';

async function readBlob<T>(path: string): Promise<T | null> {
  return r2Get<T>(path);
}

async function writeBlob(path: string, data: unknown): Promise<void> {
  await r2Put(path, JSON.stringify(data));
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

// ── User preferences ─────────────────────────────────────────────────────────

export interface UserPrefs {
  notificationEmail?: string; // where deal alerts are sent
}

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  return (await readBlob<UserPrefs>(`${PREFIX}/${userId}/prefs.json`)) ?? {};
}

export async function saveUserPrefs(userId: string, prefs: UserPrefs): Promise<void> {
  await writeBlob(`${PREFIX}/${userId}/prefs.json`, prefs);
}
