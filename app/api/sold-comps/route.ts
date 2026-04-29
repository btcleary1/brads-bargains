import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { checkRequestLimit } from '@/lib/rate-limit';
import { analyzeFlip } from '@/lib/flip-agent';

export { type CompsVerdict } from '@/lib/flip-agent';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try { await checkRequestLimit(session.userId, 'sold-comps', 60, 60_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  const { title, price, shippingCost, marketPrice, discountPct, condition } = await req.json();
  if (!title || typeof price !== 'number') {
    return NextResponse.json({ error: 'title and price required' }, { status: 400 });
  }

  const verdict = await analyzeFlip(title, price, shippingCost ?? 0, marketPrice, discountPct, condition);
  if (!verdict) return NextResponse.json({ noData: true });
  return NextResponse.json(verdict);
}
