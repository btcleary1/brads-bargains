import { getUserPrefs, saveUserPrefs } from './tracker-data';

const EBAY_API = 'https://api.ebay.com';

interface EbayOrderItem {
  title: string;
  quantity: number;
  lineItemCost?: { value: string };
}

interface EbayOrder {
  legacyOrderId: string;
  creationDate: string;
  lineItems: EbayOrderItem[];
}

async function refreshAccessToken(userId: string, prefs: any): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const res = await fetch(`${EBAY_API}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: prefs.ebayRefreshToken,
        scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.order.readonly',
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const updatedPrefs = {
      ...prefs,
      ebayAccessToken: data.access_token,
      ebayTokenExpiresAt: Date.now() + data.expires_in * 1000,
    };
    await saveUserPrefs(userId, updatedPrefs);
    return data.access_token;
  } catch {
    return null;
  }
}

export interface OrderLineItem {
  title: string;
  quantity: number;
  price: number | null;
}

export interface Order {
  orderId: string;
  date: string;
  items: OrderLineItem[];
  total: number | null;
}

async function getToken(userId: string): Promise<string | null> {
  const prefs = await getUserPrefs(userId) as any;
  if (!prefs.ebayAccessToken) return null;
  if (!prefs.ebayTokenExpiresAt || prefs.ebayTokenExpiresAt < Date.now() + 5 * 60 * 1000) {
    if (!prefs.ebayRefreshToken) return null;
    return refreshAccessToken(userId, prefs);
  }
  return prefs.ebayAccessToken;
}

export async function fetchEbayOrders(userId: string): Promise<Order[]> {
  const token = await getToken(userId);
  if (!token) return [];

  try {
    const res = await fetch(`${EBAY_API}/buy/order/v2/purchase_order?limit=50`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: EbayOrder[] = data.purchaseOrders ?? [];

    return raw.map(o => {
      const items: OrderLineItem[] = (o.lineItems ?? []).map(li => ({
        title: li.title,
        quantity: li.quantity ?? 1,
        price: li.lineItemCost ? parseFloat(li.lineItemCost.value) : null,
      }));
      const total = items.reduce((sum, li) => sum + (li.price ?? 0) * li.quantity, 0);
      return { orderId: o.legacyOrderId, date: o.creationDate, items, total: total || null };
    });
  } catch {
    return [];
  }
}

export async function fetchEbayOrderTitles(userId: string): Promise<string[]> {
  const orders = await fetchEbayOrders(userId);
  return orders.flatMap(o => o.items.map(i => i.title));
}
