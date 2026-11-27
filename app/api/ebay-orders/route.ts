import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getEbayUserTokens, saveEbayUserTokens } from '@/lib/tracker-data';
import { getEbayPurchaseHistory, refreshEbayUserToken } from '@/lib/ebay-user';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tokens = await getEbayUserTokens(session.userId);
  if (!tokens?.accessToken) {
    return NextResponse.json({ error: 'eBay account not connected. Go to Settings to connect.', orders: [] });
  }

  let token = tokens.accessToken;

  if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    try {
      const refreshed = await refreshEbayUserToken(tokens.refreshToken);
      token = refreshed.accessToken;
      // Keep the new token so the next visit doesn't have to refresh again.
      await saveEbayUserTokens(session.userId, { ...tokens, ...refreshed }).catch(() => {});
    } catch (e) {
      return NextResponse.json({ error: `Token refresh failed: ${String(e)}`, orders: [] });
    }
  }

  // Try REST Buy Order API first
  try {
    const res = await fetch('https://api.ebay.com/buy/order/v2/purchase_order?limit=50', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (res.ok && (data.purchaseOrders?.length ?? 0) > 0) {
      const orders = data.purchaseOrders.map((o: Record<string, unknown>) => {
        const lineItems = (o.lineItems as Record<string, unknown>[] ?? []);
        const items = lineItems.map((li: Record<string, unknown>) => ({
          title: li.title,
          quantity: (li.quantity as number) ?? 1,
          price: li.lineItemCost ? parseFloat((li.lineItemCost as Record<string, string>).value) : null,
        }));
        const total = items.reduce((s: number, li) => s + ((li.price ?? 0) as number) * li.quantity, 0);
        return { orderId: o.legacyOrderId, date: o.creationDate, items, total: total || null };
      });
      return NextResponse.json({ orders, source: 'rest' });
    }
  } catch {
    // Fall through to the Trading API below.
  }

  // Fallback: Trading API (GetMyeBayBuying)
  try {
    const purchased = await getEbayPurchaseHistory(token);
    const orders = purchased.map(item => ({
      orderId: item.itemId,
      date: item.endTime,
      items: [{ title: item.title, quantity: 1, price: item.price || null }],
      total: item.price || null,
    }));
    return NextResponse.json({ orders, source: 'trading' });
  } catch (e) {
    return NextResponse.json({ error: `Trading API failed: ${String(e)}`, orders: [] });
  }
}
