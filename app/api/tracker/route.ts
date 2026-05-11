import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDeals, saveDeals, TrackerDeal } from '@/lib/tracker-data';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const deals = await getDeals(session.userId);
  return NextResponse.json({ deals });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const deals = await getDeals(session.userId);

  if (body.id) {
    // Verify ownership — reject if this deal doesn't belong to this user
    if (!deals.some(d => d.id === body.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Cap notes length
    if (body.notes && typeof body.notes === 'string') body.notes = body.notes.slice(0, 5000);
    const updated = deals.map(d => d.id === body.id ? { ...d, ...body } : d);
    await saveDeals(session.userId, updated);
    return NextResponse.json({ success: true, deals: updated });
  }

  // Add new
  const newDeal: TrackerDeal = {
    id: randomBytes(8).toString('hex'),
    ebayItemId: body.ebayItemId ?? '',
    title: body.title ?? '',
    ebayPrice: body.ebayPrice ?? 0,
    marketPrice: body.marketPrice ?? null,
    discountPct: body.discountPct ?? null,
    condition: body.condition ?? '',
    imageUrl: body.imageUrl ?? '',
    additionalImages: body.additionalImages ?? [],
    ebayUrl: body.ebayUrl ?? '',
    category: body.category ?? '',
    status: 'watching',
    purchasedAt: null,
    sellTargetPrice: body.marketPrice ? Math.round(body.marketPrice * 0.6 * 100) / 100 : null,
    sellActualPrice: null,
    soldAt: null,
    shippingCost: body.shippingCost ?? null,
    notes: body.notes ?? '',
    listingDraft: null,
    createdAt: new Date().toISOString(),
  };

  const updated = [newDeal, ...deals];
  await saveDeals(session.userId, updated);
  return NextResponse.json({ success: true, deal: newDeal, deals: updated });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const deals = await getDeals(session.userId);
  const updated = deals.filter(d => d.id !== id);
  await saveDeals(session.userId, updated);
  return NextResponse.json({ success: true, deals: updated });
}
