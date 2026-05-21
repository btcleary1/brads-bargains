import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { fetchEbayOrders } from '@/lib/ebay-orders';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orders = await fetchEbayOrders(session.userId);
  return NextResponse.json({ orders });
}
