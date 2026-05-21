import { r2Get, r2Put, r2Del } from './r2';
import type { FilterPrefs } from './deal-score';

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
  // Price history — one snapshot per day from price-check cron
  priceHistory?: { date: string; price: number }[];
  // Set to true by price-check cron when the eBay listing is no longer available
  ebayEnded?: boolean;
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
  lastNotifiedIds?: string[]; // itemIds already emailed — prevents repeat alerts
}

export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  return (await readBlob<SavedSearch[]>(`${PREFIX}/${userId}/searches.json`)) ?? [];
}

export async function saveSavedSearches(userId: string, searches: SavedSearch[]): Promise<void> {
  await writeBlob(`${PREFIX}/${userId}/searches.json`, searches);
}

// ── User preferences ─────────────────────────────────────────────────────────

export type { FilterPrefs };

export interface UserPrefs {
  notificationEmail?: string;     // where deal alerts are sent
  watchlistQueries?: string[];    // personalized search terms for daily digest
  digestCount?: number;           // how many deals per email (3, 5, or 10)
  digestCategories?: string[];    // which categories to include (empty = all)
  ebayAccessToken?: string;       // eBay OAuth user token
  ebayRefreshToken?: string;
  ebayTokenExpiresAt?: number;
  defaultPriceMin?: number;
  defaultPriceMax?: number;
  defaultMinProfit?: number;
  defaultMinDiscount?: number;
  defaultSingleQtyOnly?: boolean;
  maxDaysToSell?: number;          // hide items estimated to take longer than this to sell (null = no limit)
  notificationPhone?: string;
  pushSubscriptions?: object[];
  filterPrefs?: FilterPrefs;      // user-configured item filter criteria
  showLocalPickup?: boolean;      // include local-pickup-only listings (default false)
  onboardingComplete?: boolean;   // true once user has seen and dismissed the first-run setup card
  sentItemIds?: { itemId: string; sentAt: string }[]; // items already sent in digest (30-day dedup)
}

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  return (await readBlob<UserPrefs>(`${PREFIX}/${userId}/prefs.json`)) ?? {};
}

export async function saveUserPrefs(userId: string, prefs: UserPrefs): Promise<void> {
  await writeBlob(`${PREFIX}/${userId}/prefs.json`, prefs);
}

// ── eBay user OAuth tokens ────────────────────────────────────────────────────

export interface EbayUserTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;         // Unix ms
  refreshExpiresAt: number;  // Unix ms
}

export async function getEbayUserTokens(userId: string): Promise<EbayUserTokens | null> {
  return readBlob<EbayUserTokens>(`${PREFIX}/${userId}/ebay-tokens.json`);
}

export async function saveEbayUserTokens(userId: string, tokens: EbayUserTokens): Promise<void> {
  await writeBlob(`${PREFIX}/${userId}/ebay-tokens.json`, tokens);
}

export async function deleteEbayUserTokens(userId: string): Promise<void> {
  await r2Del(`${PREFIX}/${userId}/ebay-tokens.json`);
}
