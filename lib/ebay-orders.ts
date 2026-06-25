import { getEbayUserTokens, saveEbayUserTokens } from './tracker-data';
import { refreshEbayUserToken, getEbayPurchaseHistory, getEbaySavedSearches } from './ebay-user';

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

export async function getEbayAccessToken(userId: string): Promise<string | null> {
  return getToken(userId);
}

async function getToken(userId: string): Promise<string | null> {
  const tokens = await getEbayUserTokens(userId);
  if (!tokens) return null;

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

  const items = await getEbayPurchaseHistory(token);
  return items.map(item => ({
    orderId: item.itemId,
    date: item.endTime,
    items: [{ title: item.title, quantity: 1, price: item.price || null }],
    total: item.price || null,
  }));
}

export async function fetchEbayOrderTitles(userId: string): Promise<string[]> {
  const orders = await fetchEbayOrders(userId);
  return orders.flatMap(o => o.items.map(i => i.title));
}

export async function fetchEbaySavedSearchQueries(userId: string): Promise<string[]> {
  const token = await getToken(userId);
  if (!token) return [];
  try {
    return await getEbaySavedSearches(token);
  } catch {
    return [];
  }
}
