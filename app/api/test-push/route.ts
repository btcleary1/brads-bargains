import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/users';
import { getUserPrefs } from '@/lib/tracker-data';
import { sendPushToSubscriptions } from '@/lib/push-notify';

export const runtime = 'nodejs';

const SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = req.nextUrl.searchParams.get('to') ?? process.env.NOTIFICATION_EMAIL ?? '';
  if (!email) return NextResponse.json({ error: 'No recipient' }, { status: 400 });

  const user = await getUserByEmail(email).catch(() => null);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const prefs = await getUserPrefs(user.userId);
  const subs = (prefs.pushSubscriptions as object[] | undefined) ?? [];
  if (!subs.length) return NextResponse.json({ sent: false, reason: 'No push subscriptions found for this user' });

  // Build a spotlight URL so tapping the notification opens the specific item
  const { buildSpotlightUrl } = await import('@/lib/notify');
  const mockDeal = {
    itemId: 'test-001', title: 'Nintendo Switch OLED Model - White, All Original Accessories',
    price: 189, marketPrice: 349, discountPct: 46, condition: 'Like New',
    imageUrl: 'https://i.ebayimg.com/images/g/test/s-l500.jpg',
    itemUrl: 'https://www.ebay.com/itm/test', category: 'Gaming', shippingCost: 0,
    location: 'United States', listingDate: null, seller: 'test_seller',
    sellerFeedbackPercent: 99.8, sellerFeedbackScore: null,
    currency: 'USD', additionalImages: [], listingType: 'FixedPrice', quantity: 1, localPickupOnly: false,
  };
  const mockFlip = { verdict: 'buy' as const, netProfit: 82, avgSoldPrice: 298, soldCount: 14, marginPct: 43, estDaysToSell: 6, sourcesCount: 4, stockxLastSale: 310, mercariAvgSold: 275, amazonPrice: 329 };
  const spotlightUrl = buildSpotlightUrl(mockDeal, mockFlip);

  const result = await sendPushToSubscriptions(
    subs,
    "Brad's Bargains — Test Notification",
    'Nintendo Switch OLED — $189 · 46% off · ~$82 net profit. Tap to view.',
    spotlightUrl,
  );

  return NextResponse.json({ sent: result.sent, failed: result.failed, subscriptions: subs.length });
}
