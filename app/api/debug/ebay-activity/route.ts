import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { fetchEbayBuyingActivity } from '@/lib/ebay-watchlist';
import { fetchEbayOrderTitles } from '@/lib/ebay-orders';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [activity, orderTitles] = await Promise.allSettled([
    fetchEbayBuyingActivity(session.userId),
    fetchEbayOrderTitles(session.userId),
  ]);

  return NextResponse.json({
    tradingApi: activity.status === 'fulfilled' ? activity.value : { error: activity.reason?.message },
    orderApi: orderTitles.status === 'fulfilled' ? orderTitles.value : { error: orderTitles.reason?.message },
  });
}
