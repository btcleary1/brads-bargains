import { NextRequest, NextResponse } from 'next/server';
import { searchDeals } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals } from '@/lib/deal-score';
import { sendDailyDigest } from '@/lib/notify';
import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';

const DIGEST_STATE_PATH = 'deal-wiz/digest-state.json';
const DIGEST_SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

// Categories to search when live eBay API is available
const SEARCH_QUERIES = [
  'iPhone unlocked',
  'MacBook Air',
  'PlayStation 5',
  'Nintendo Switch',
  'Sony headphones',
  'iPad',
  'Pokemon card PSA',
  'sports card PSA',
  'LEGO sealed',
  'vintage comic CGC',
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const force  = req.nextUrl.searchParams.get('force') === '1';

  if (secret !== DIGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Prevent double-sending on the same day unless forced
  if (!force) {
    const state = await r2Get<{ lastSentDate: string }>(DIGEST_STATE_PATH);
    if (state?.lastSentDate === todayKey()) {
      return NextResponse.json({ skipped: true, reason: 'Already sent today', date: todayKey() });
    }
  }

  const forceMock = req.nextUrl.searchParams.get('mock') === '1';
  const toEmail = req.nextUrl.searchParams.get('to') || process.env.NOTIFICATION_EMAIL;
  if (!toEmail) {
    return NextResponse.json({ error: 'NOTIFICATION_EMAIL not configured' }, { status: 500 });
  }

  try {
    let allItems;

    if (forceMock || process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID) {
      // Use mock data
      allItems = MOCK_DEALS;
    } else {
      // Pull from live eBay across all target categories
      const results = await Promise.allSettled(
        SEARCH_QUERIES.map(q => searchDeals(q, 20))
      );
      const seen = new Set<string>();
      allItems = results
        .flatMap(r => r.status === 'fulfilled' ? r.value : [])
        .filter(item => {
          if (seen.has(item.itemId)) return false;
          seen.add(item.itemId);
          return true;
        });
    }

    const best5 = topDeals(allItems, 5);

    if (best5.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No qualifying deals found' });
    }

    await sendDailyDigest(best5, toEmail);

    // Record send date to prevent duplicates
    await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey() }));

    return NextResponse.json({
      sent: true,
      date: todayKey(),
      deals: best5.map(d => ({
        title: d.title,
        price: d.price,
        marketPrice: d.marketPrice,
        discountPct: d.discountPct,
        condition: d.condition,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
