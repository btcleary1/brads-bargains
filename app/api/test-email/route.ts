import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDigest, FlipData } from '@/lib/notify';

export const runtime = 'nodejs';

const SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const to = req.nextUrl.searchParams.get('to') ?? process.env.NOTIFICATION_EMAIL ?? '';
  if (!to) return NextResponse.json({ error: 'No recipient' }, { status: 400 });

  // Sample item with rich multi-source comp data
  const sampleItem: any = {
    itemId: 'test-001',
    title: 'Nintendo Switch OLED Model - White, All Original Accessories',
    price: 189,
    marketPrice: 349,
    discountPct: 46,
    condition: 'Like New',
    imageUrl: 'https://i.ebayimg.com/images/g/test/s-l500.jpg',
    itemUrl: 'https://www.ebay.com/itm/test',
    category: 'Gaming',
    shippingCost: 0,
    location: 'United States',
    listingDate: new Date().toISOString(),
    seller: 'test_seller',
    sellerFeedbackPercent: 99.8,
  };

  const flipData: FlipData = {
    verdict: 'buy',
    netProfit: 82,
    avgSoldPrice: 298,
    soldCount: 14,
    marginPct: 43,
    estDaysToSell: 6,
    sourcesCount: 4,
    stockxLastSale: 310,
    mercariAvgSold: 275,
    amazonPrice: 329,
  };

  const flipMap = new Map<string, FlipData>([['test-001', flipData]]);

  const aiPick = 'Go with the Nintendo Switch OLED — buy at $189, ~$82 net profit. 14 eBay comps at avg $298, confirmed by StockX ($310) and Mercari ($275). Fast 6-day avg sell time.';

  try {
    await sendDailyDigest([sampleItem], to, aiPick, flipMap);
    return NextResponse.json({ sent: true, to });
  } catch (err) {
    return NextResponse.json({ sent: false, error: String(err) });
  }
}
