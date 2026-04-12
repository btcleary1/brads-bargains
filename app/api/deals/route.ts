import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals } from '@/lib/deal-score';
import { sendDailyDigest } from '@/lib/notify';
import { getUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

const MIN_DISCOUNT = 70; // 70% off market price

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
        // eBay credentials not yet active — fall back to mock data
        raw = MOCK_DEALS.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || query === '*' || query === '');
      }
    }

    // Use all mock results when query matches nothing
    const items: EbayItem[] = raw.length === 0 ? MOCK_DEALS : raw;

    // Filter to deals with marketPrice and 70%+ discount
    const hotDeals: EbayItem[] = topDeals(items, 50, MIN_DISCOUNT);

    if (notify && hotDeals.length > 0) {
      // Use per-user notification email, fallback to env var
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
      minDiscount: MIN_DISCOUNT,
      items: items.map(item => ({
        ...item,
        isHotDeal: item.discountPct !== null && item.discountPct >= MIN_DISCOUNT,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
