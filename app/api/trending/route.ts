import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getEbayToken } from '@/lib/ebay';
import { checkRequestLimit } from '@/lib/rate-limit';
import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 90;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface TrendingItem {
  itemId: string;
  title: string;
  price: number;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  itemUrl: string;
  watchCount: number;
  listingDate: string | null;
  category: string;
  demandScore: number; // 0-100 composite
  trendSignal: string; // short reason e.g. "142 watchers, listed 2d ago"
}

export interface TrendingResult {
  items: TrendingItem[];
  summary: string;
  fetchedAt: string;
}

const EBAY_API_BASE = 'https://api.ebay.com';
const TRENDING_CACHE_KEY = 'deal-wiz/trending-cache.json';
const TRENDING_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours — all users share one refresh

async function searchTrending(query: string, maxResults = 20): Promise<TrendingItem[]> {
  const token = await getEbayToken();
  const params = new URLSearchParams({
    q: query,
    limit: String(maxResults),
    sort: 'newlyListed',
    fieldgroups: 'EXTENDED',
  });
  const url = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params}&filter=buyingOptions:{FIXED_PRICE},priceCurrency:USD,conditionIds:{1000|1500|3000|4000|5000}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS',
    },
    cache: 'no-store',
  });

  if (!res.ok) return [];

  const data = await res.json();
  const now = Date.now();

  return (data.itemSummaries ?? []).map((raw: any): TrendingItem | null => {
    const price = parseFloat(raw.price?.value ?? '0');
    if (price <= 0) return null;

    // `??` binds tighter than `?:`, so the previous form always evaluated the
    // true branch against an absent watchCountString and yielded 0, silently
    // disabling the 50-point watcher component of demandScore.
    const watchCount: number = Number(raw.watchCount ?? raw.watchCountString ?? 0) || 0;
    const listingDate: string | null = raw.itemCreationDate ?? null;

    const ageHours = listingDate ? (now - new Date(listingDate).getTime()) / 3_600_000 : null;
    const ageDays = ageHours != null ? ageHours / 24 : null;

    // Demand score: weighted combination of watch count and recency
    let demandScore = 0;
    if (watchCount >= 200) demandScore += 50;
    else if (watchCount >= 100) demandScore += 40;
    else if (watchCount >= 50) demandScore += 30;
    else if (watchCount >= 20) demandScore += 20;
    else if (watchCount >= 5) demandScore += 10;

    if (ageDays != null) {
      if (ageDays < 1) demandScore += 30;
      else if (ageDays < 3) demandScore += 20;
      else if (ageDays < 7) demandScore += 10;
    }

    const marketPrice = raw.marketingPrice?.originalPrice
      ? parseFloat(raw.marketingPrice.originalPrice.value ?? '0')
      : null;
    const discountPct = marketPrice && marketPrice > 0
      ? Math.round(((marketPrice - price) / marketPrice) * 100)
      : null;
    if (discountPct != null && discountPct >= 20) demandScore += 20;

    const signals: string[] = [];
    if (watchCount > 0) signals.push(`${watchCount} watchers`);
    if (ageDays != null && ageDays < 7) signals.push(`listed ${ageDays < 1 ? 'today' : `${Math.floor(ageDays)}d ago`}`);
    if (discountPct != null && discountPct >= 20) signals.push(`${discountPct}% off`);

    const itemUrl = raw.itemWebUrl ?? '';
    const itemIdMatch = itemUrl.match(/\/itm\/(\d+)/);
    const itemId = itemIdMatch ? itemIdMatch[1] : (raw.itemId ?? '');
    return {
      itemId,
      title: raw.title ?? '',
      price,
      marketPrice,
      discountPct,
      condition: raw.condition ?? 'Unknown',
      imageUrl: raw.image?.imageUrl ?? '',
      itemUrl,
      watchCount,
      listingDate,
      category: raw.categories?.[0]?.categoryName ?? query,
      demandScore: Math.min(100, demandScore),
      trendSignal: signals.slice(0, 2).join(' · ') || 'Newly listed',
    };
  }).filter((i: TrendingItem | null): i is TrendingItem => i !== null && i.demandScore >= 10);
}

const TRENDING_QUERIES = [
  'iPhone 15 Pro',
  'PlayStation 5',
  'MacBook Pro M3',
  'Air Jordan 1',
  'Pokemon cards',
  'Nintendo Switch OLED',
  'Apple Watch Series 9',
  'DJI drone',
];

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try { await checkRequestLimit(session.userId, 'trending', 10, 60_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  if (!process.env.EBAY_CLIENT_ID) {
    return NextResponse.json({ error: 'eBay API not configured' }, { status: 503 });
  }

  // Serve shared cache — all users get the same trending data, refreshed every 12 hours
  const trendingCached = await r2Get<TrendingResult & { fetchedAt: string }>(TRENDING_CACHE_KEY);
  if (trendingCached && trendingCached.items?.length > 0) {
    const age = Date.now() - new Date(trendingCached.fetchedAt).getTime();
    if (age < TRENDING_CACHE_TTL) return NextResponse.json(trendingCached);
  }

  try {
    // Run searches in parallel across trending categories
    const batchResults = await Promise.allSettled(
      TRENDING_QUERIES.map(q => searchTrending(q, 15))
    );

    const allItems: TrendingItem[] = [];
    const seen = new Set<string>();
    batchResults.forEach(r => {
      if (r.status === 'fulfilled') {
        r.value.forEach(item => {
          const key = item.title.toLowerCase().slice(0, 40);
          if (!seen.has(key)) { seen.add(key); allItems.push(item); }
        });
      }
    });

    // Sort by demand score, take top 12
    const top = allItems.sort((a, b) => b.demandScore - a.demandScore).slice(0, 12);

    if (top.length === 0) {
      // All searches returned nothing — serve stale cache if available, else empty
      if (trendingCached?.items?.length) return NextResponse.json({ ...trendingCached, stale: true });
      return NextResponse.json({ items: [], summary: 'No trending items found right now.', fetchedAt: new Date().toISOString() });
    }

    // Generate a one-line AI summary of what's trending
    let summary = `${top.length} hot items spotted — top signal: ${top[0].trendSignal}`;
    try {
      const topTitles = top.slice(0, 5).map((i, idx) => `${idx + 1}. ${i.title} (${i.trendSignal})`).join('\n');
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: `These eBay items are trending right now based on watcher count and recency. In one sentence (under 80 chars), tell a reseller what category or theme is hot today. No hype, just signal.\n\n${topTitles}`,
        }] as MessageParam[],
      });
      const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null;
      if (text) summary = text;
    } catch { /* use default summary */ }

    const result: TrendingResult = { items: top, summary, fetchedAt: new Date().toISOString() };
    await r2Put(TRENDING_CACHE_KEY, JSON.stringify(result)).catch(() => {});
    return NextResponse.json(result);

  } catch (err: any) {
    // eBay rate limited — serve stale cache if available
    if (trendingCached?.items?.length && (String(err).includes('Too many requests') || String(err).includes('2001'))) {
      return NextResponse.json({ ...trendingCached, stale: true });
    }
    return NextResponse.json({ error: err.message || 'Trending search failed' }, { status: 500 });
  }
}
