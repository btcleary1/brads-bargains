import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { sendDealAlert } from '@/lib/notify';

export const runtime = 'nodejs';

const MIN_DISCOUNT = 70; // 70% off market price

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.get('q') ?? '';
  const notify = req.nextUrl.searchParams.get('notify') === '1';

  if (!query.trim()) return NextResponse.json({ error: 'Search query required.' }, { status: 400 });

  try {
    const items = await searchDeals(query, 50);

    // Filter to deals with marketPrice and 70%+ discount
    const hotDeals: EbayItem[] = items.filter(
      item => item.marketPrice !== null && item.discountPct !== null && item.discountPct >= MIN_DISCOUNT
    );

    if (notify && hotDeals.length > 0) {
      sendDealAlert(hotDeals, query).catch(() => {}); // fire and forget
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
