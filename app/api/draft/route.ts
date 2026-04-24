import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDeals, saveDeals } from '@/lib/tracker-data';
import { getItemDetail } from '@/lib/ebay';

export const runtime = 'nodejs';

// Generate a Facebook Marketplace listing draft for a tracked deal
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dealId } = await req.json();
  if (!dealId) return NextResponse.json({ error: 'dealId required.' }, { status: 400 });

  const deals = await getDeals(session.userId);
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  // Fetch fresh eBay details for richer description
  let ebayDetail = null;
  try {
    ebayDetail = await getItemDetail(deal.ebayItemId);
  } catch { /* use tracker data as fallback */ }

  const item = ebayDetail ?? deal;
  const sellPrice = deal.sellTargetPrice
    ?? (deal.marketPrice ? Math.round(deal.marketPrice * 0.85) : Math.round(deal.ebayPrice * 1.3));
  const condition = deal.condition || 'Good';

  // Build the listing draft
  const draft = `${deal.title}

💰 Price: $${sellPrice.toFixed(2)}
📦 Condition: ${condition}

${deal.category ? `Category: ${deal.category}\n` : ''}✅ Item ships fast or local pickup available.

Description:
${deal.title} in ${condition.toLowerCase()} condition. ${deal.notes ? deal.notes + ' ' : ''}Ready to go — message me with any questions!

#forsale #${(deal.category || 'deal').replace(/\s+/g, '').toLowerCase()} #ebay #greatdeal`.trim();

  // Save draft back to the deal
  const updatedDeals = deals.map(d =>
    d.id === dealId ? { ...d, listingDraft: draft } : d
  );
  await saveDeals(session.userId, updatedDeals as any);

  return NextResponse.json({ success: true, draft, imageUrl: deal.imageUrl, additionalImages: deal.additionalImages });
}
