import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getEbayUserTokens } from '@/lib/tracker-data';
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
    } catch (e) {
      return NextResponse.json({ error: `Token refresh failed: ${String(e)}`, orders: [] });
    }
  }

  const debug: Record<string, unknown> = {};

  // Try REST Buy Order API first
  try {
    const res = await fetch('https://api.ebay.com/buy/order/v2/purchase_order?limit=50', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    const data = await res.json();
    debug.restStatus = res.status;
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
  } catch (e) {
    debug.restError = String(e);
  }

  // Fallback: Trading API (GetMyeBayBuying)
  try {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <WonList>
    <Include>true</Include>
    <NumberOfDays>180</NumberOfDays>
    <Sort>EndTimeDescending</Sort>
    <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </WonList>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetMyeBayBuyingRequest>`;

    const tradingRes = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID!,
        'X-EBAY-API-IAF-TOKEN': token,
      },
      body: soapBody,
      cache: 'no-store',
    });
    const xml = await tradingRes.text();
    debug.tradingStatus = tradingRes.status;
    debug.tradingXmlSnippet = xml.slice(0, 1200);

    const purchased = await getEbayPurchaseHistory(token);
    debug.tradingCount = purchased.length;
    const orders = purchased.map(item => ({
      orderId: item.itemId,
      date: item.endTime,
      items: [{ title: item.title, quantity: 1, price: item.price || null }],
      total: item.price || null,
    }));
    return NextResponse.json({ orders, source: 'trading', debug });
  } catch (e) {
    debug.tradingError = String(e);
    return NextResponse.json({ error: `Trading API failed: ${String(e)}`, orders: [], debug });
  }
}
