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

export async function fetchEbayOrderTitles(userId: string): Promise<string[]> {
  const prefs = await getUserPrefs(userId) as any;
  if (!prefs.ebayAccessToken) return [];

  let token = prefs.ebayAccessToken;

  // Refresh if expired or expiring within 5 minutes
  if (!prefs.ebayTokenExpiresAt || prefs.ebayTokenExpiresAt < Date.now() + 5 * 60 * 1000) {
    if (!prefs.ebayRefreshToken) return [];
    token = await refreshAccessToken(userId, prefs) ?? '';
    if (!token) return [];
  }

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
    const orders: EbayOrder[] = data.purchaseOrders ?? [];

    const titles: string[] = [];
    for (const order of orders) {
      for (const item of order.lineItems ?? []) {
        if (item.title) titles.push(item.title);
      }
    }
    return titles;
  } catch {
    return [];
  }
}
