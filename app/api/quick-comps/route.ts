import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getMultiSourceComps } from '@/lib/multi-source-comps';
import { computeVerdict } from '@/lib/flip-verdict';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Lightweight comps — no AI agent, uses multi-source data only.
// Used for automatic bulk grading on page load; zero Anthropic cost.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, price, shippingCost } = await req.json();
  if (!title || typeof price !== 'number') {
    return NextResponse.json({ noData: true });
  }

  try {
    const comps = await getMultiSourceComps(title, 12);
    if (!comps || comps.ebayCount < 2) return NextResponse.json({ noData: true });

    const shipping = shippingCost ?? 0;
    const netProfit = Math.round(comps.weightedAvgSoldPrice * 0.85 - price - shipping);
    const marginPct = Math.round((netProfit / price) * 100);

    const days = comps.estDaysToSell;
    const verdict = computeVerdict({ netProfit, marginPct, soldCount: comps.ebayCount, daysToSell: days });

    const annROI = days != null && days >= 1 && netProfit > 0
      ? Math.round((netProfit / price / days) * 365 * 100)
      : null;

    return NextResponse.json({
      verdict,
      avgSoldPrice: comps.weightedAvgSoldPrice,
      soldCount: comps.ebayCount,
      netProfit,
      marginPct,
      reasoning: '',
      searchQuery: comps.modelQuery,
      daysToSell: days,
      capitalEfficiency: annROI,
      sourcesCount: comps.sourcesUsed.length,
      multiSourceConfidence: comps.confidence,
    });
  } catch {
    return NextResponse.json({ noData: true });
  }
}
