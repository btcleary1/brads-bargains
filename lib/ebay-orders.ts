import { getEbayUserTokens, saveEbayUserTokens } from './tracker-data';
import { refreshEbayUserToken, getEbayPurchaseHistory } from './ebay-user';

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
  const tokens = await getEbayUserTokens(userId);
  if (!tokens) return null;

  // Refresh if expiring within 5 minutes
  if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    if (!tokens.refreshToken) return null;
    try {
      const refreshed = await refreshEbayUserToken(tokens.refreshToken);
      await saveEbayUserTokens(userId, { ...tokens, ...refreshed });
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

  return tokens.accessToken;
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
