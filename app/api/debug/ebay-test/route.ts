import { NextRequest, NextResponse } from 'next/server';
import { searchDeals } from '@/lib/ebay';
import { isJunk } from '@/lib/deal-score';

export const runtime = 'nodejs';

const SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? 'iphone';
  try {
    const raw = await searchDeals(q, 20);
    const passing = raw.filter(i => !isJunk(i));
    return NextResponse.json({
      ok: true,
      query: q,
      rawCount: raw.length,
      passingCount: passing.length,
      filteredOutCount: raw.length - passing.length,
      sample: raw.slice(0, 3).map(i => ({
        title: i.title,
        price: i.price,
        discountPct: i.discountPct,
        imageUrl: !!i.imageUrl,
        condition: i.condition,
        shippingCost: i.shippingCost,
        isJunk: isJunk(i),
      })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
