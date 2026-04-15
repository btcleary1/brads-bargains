import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals } from '@/lib/deal-score';
import { sendDailyDigest } from '@/lib/notify';
import { getUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

const START_DISCOUNT = 60; // start at 60%, flex down until 5 hot deals found

// Find the lowest discount threshold that yields at least 5 qualifying items.
// Drops 1% per attempt from START_DISCOUNT down to 0.
function flexDiscount(items: EbayItem[], target = 5): { hotDeals: EbayItem[]; minDiscount: number } {
  for (let pct = START_DISCOUNT; pct >= 0; pct--) {
    const hot = items.filter(i => i.discountPct !== null && i.discountPct >= pct);
    if (hot.length >= target) return { hotDeals: hot, minDiscount: pct };
  }
  // No items have any discount data — return all items at 0%
  return { hotDeals: items, minDiscount: 0 };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.get('q') ?? '';
  const notify = req.nextUrl.searchParams.get('notify') === '1';

  if (!query.trim()) return NextResponse.json({ error: 'Search query required.' }, { status: 400 });

  try {
    const isMock = process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID;
    let raw: EbayItem[];
    if (isMock) {
      raw = MOCK_DEALS.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || query === '*' || query === '');
    } else {
      try {
        raw = await searchDeals(query, 50);
      } catch {
        raw = MOCK_DEALS.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || query === '*' || query === '');
      }
    }

    const items: EbayItem[] = raw;
    const { hotDeals, minDiscount } = flexDiscount(items);

    if (notify && hotDeals.length > 0) {
      const prefs = await getUserPrefs(session.userId);
      const alertEmail = prefs.notificationEmail || process.env.NOTIFICATION_EMAIL;
      if (alertEmail) {
        sendDailyDigest(topDeals(hotDeals, 5), alertEmail).catch(() => {});
      }
    }

    return NextResponse.json({
      query,
      total: items.length,
      hotDeals: hotDeals.length,
      minDiscount,
      items: items.map(item => ({
        ...item,
        isHotDeal: item.discountPct !== null && item.discountPct >= minDiscount,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
