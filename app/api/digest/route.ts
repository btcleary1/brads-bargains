import { NextRequest, NextResponse } from 'next/server';
import { searchDeals } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals } from '@/lib/deal-score';
import { sendDailyDigest } from '@/lib/notify';
import { r2Get, r2Put } from '@/lib/r2';
import { getAllUsers } from '@/lib/users';
import { getUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

const DIGEST_STATE_PATH = 'deal-wiz/digest-state.json';
const DIGEST_SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

// Categories to search when live eBay API is available
const SEARCH_QUERIES = [
  'iPhone unlocked',
  'MacBook Air',
  'iPad unlocked',
  'Apple Watch unlocked',
  'AirPods',
  'Nintendo Switch',
  'Air Jordan sneakers',
  'Nike sneakers deadstock',
  'Pokemon card PSA',
  'sports card PSA graded',
  'LEGO sealed',
  'vintage comic CGC',
  'DJI drone',
  'camera lens',
  'gold coin',
  'silver coin',
  'video game lot',
  'mechanical keyboard',
  'designer sunglasses',
  'luxury watch',
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
  // ?to= overrides for manual testing; otherwise sends to all registered users
  const toOverride = req.nextUrl.searchParams.get('to') || null;

  try {
    let allItems;

    if (forceMock || process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID) {
      allItems = MOCK_DEALS;
    } else {
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

    // Build recipient list with personalized deals per user
    type UserDigest = { email: string; deals: typeof best5 };
    let userDigests: UserDigest[] = [];

    if (toOverride) {
      userDigests = [{ email: toOverride, deals: best5 }];
    } else {
      const users = await getAllUsers();
      const prefsResults = await Promise.allSettled(users.map(u => getUserPrefs(u.userId)));

      for (let i = 0; i < users.length; i++) {
        const r = prefsResults[i];
        if (r.status !== 'fulfilled' || !r.value.notificationEmail) continue;
        const prefs = r.value;

        // If user has a personal watchlist, search those terms for their digest
        let userDeals = best5;
        if (prefs.watchlistQueries && prefs.watchlistQueries.length > 0) {
          const personalResults = await Promise.allSettled(prefs.watchlistQueries.map(q => searchDeals(q, 20)));
          const seen = new Set<string>();
          const personalItems = personalResults
            .flatMap(res => res.status === 'fulfilled' ? res.value : [])
            .filter(item => { if (seen.has(item.itemId)) return false; seen.add(item.itemId); return true; });
          userDeals = personalItems.length > 0 ? topDeals(personalItems, 5) : best5;
        }

        userDigests.push({ email: prefs.notificationEmail, deals: userDeals });
      }

      if (userDigests.length === 0 && process.env.NOTIFICATION_EMAIL) {
        userDigests = [{ email: process.env.NOTIFICATION_EMAIL, deals: best5 }];
      }
    }

    if (userDigests.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No recipients configured' });
    }

    // Send to all recipients — collect results to surface any errors
    const sendResults = await Promise.allSettled(userDigests.map(({ email, deals }) => sendDailyDigest(deals, email)));
    const errors = sendResults
      .map((r, i) => r.status === 'rejected' ? `${userDigests[i].email}: ${r.reason}` : null)
      .filter(Boolean);
    const successCount = sendResults.filter(r => r.status === 'fulfilled').length;

    if (successCount === 0) {
      return NextResponse.json({ sent: false, reason: 'All emails failed', errors }, { status: 500 });
    }

    // Record send date to prevent duplicates
    await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey() }));

    return NextResponse.json({
      sent: true,
      date: todayKey(),
      recipients: successCount,
      errors: errors.length > 0 ? errors : undefined,
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
