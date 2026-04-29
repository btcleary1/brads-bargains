import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { isJunk } from '@/lib/deal-score';
import { sendDailyDigest } from '@/lib/notify';
import { getUserPrefs } from '@/lib/tracker-data';
import { checkRequestLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const runtime = 'nodejs';

const START_DISCOUNT = 60; // start at 60%, flex down until 5 hot deals found

// Find the lowest discount threshold that yields at least 5 qualifying items.
// Drops 1% per attempt from startDiscount down to 0.
function flexDiscount(items: EbayItem[], target = 5, startDiscount = START_DISCOUNT): { hotDeals: EbayItem[]; minDiscount: number } {
  for (let pct = startDiscount; pct >= 0; pct--) {
    const hot = items.filter(i => i.discountPct !== null && i.discountPct >= pct);
    if (hot.length >= target) return { hotDeals: hot, minDiscount: pct };
  }
  // No items have any discount data — return all items at 0%
  return { hotDeals: items, minDiscount: 0 };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 20 searches per minute per user
  try { await checkRequestLimit(session.userId, 'deals', 20, 60_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  const query = req.nextUrl.searchParams.get('q') ?? '';
  const notify = req.nextUrl.searchParams.get('notify') === '1';

  if (!query.trim()) return NextResponse.json({ error: 'Search query required.' }, { status: 400 });

  try {
    const prefs = await getUserPrefs(session.userId);
    const filterPrefs = prefs.filterPrefs;
    const startDiscount = filterPrefs?.minDiscountPct ?? START_DISCOUNT;

    const isMock = process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID;
    let raw: EbayItem[];
    if (isMock) {
      raw = MOCK_DEALS.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || query === '*' || query === '');
    } else {
      try {
        raw = await searchDeals(query, 200);
      } catch {
        raw = MOCK_DEALS.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || query === '*' || query === '');
      }
    }

    // Apply user's filter criteria before computing hot deals
    const items: EbayItem[] = raw.filter(i => !isJunk(i, filterPrefs));
    const { hotDeals, minDiscount } = flexDiscount(items, 5, startDiscount);

    if (notify && hotDeals.length > 0) {
      const alertEmail = prefs.notificationEmail || process.env.NOTIFICATION_EMAIL;
      if (!alertEmail) {
        return NextResponse.json({ error: 'No alert email configured. Add one in Settings.' }, { status: 400 });
      }
      const top5 = [...hotDeals].sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0)).slice(0, 5);

      // Generate AI Pick for the email
      let aiPick: string | undefined;
      try {
        const topDesc = top5.map((i, idx) => {
          const net = i.marketPrice ? Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) : null;
          return `#${idx + 1} ${i.title} — buy $${i.price}, market $${i.marketPrice ?? 'unknown'}, ~$${net ?? '?'} net profit. Condition: ${i.condition}.`;
        }).join('\n');
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: `You are a sharp eBay flip advisor. Net profit already accounts for eBay fees. Recommend the single best item to buy for resale profit. Name it directly. Reference net profit. Under 50 words. No markdown.\n\n${topDesc}` }],
        });
        const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
        if (text) aiPick = text;
      } catch { /* send without AI pick if it fails */ }

      await sendDailyDigest(top5, alertEmail, aiPick);
    }

    return NextResponse.json({
      query,
      total: items.length,
      hotDeals: hotDeals.length,
      minDiscount,
      items: items.map(item => ({
        ...item,
        isHotDeal: item.discountPct !== null && item.discountPct >= minDiscount,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
