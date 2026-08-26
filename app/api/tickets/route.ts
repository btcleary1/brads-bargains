import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { checkRequestLimit } from '@/lib/rate-limit';
import { planTicketSearch } from '@/lib/ticket-agent';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try { await checkRequestLimit(session.userId, 'tickets', 10, 60_000); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 429 }); }

  const away = req.nextUrl.searchParams.get('away') ?? 'LSU';
  const home = req.nextUrl.searchParams.get('home') ?? 'Auburn';
  const qtyParam = req.nextUrl.searchParams.get('qty');
  const qty = Math.min(Math.max(parseInt(qtyParam ?? '15', 10) || 15, 1), 40);
  const seasonYear = parseInt(req.nextUrl.searchParams.get('season') ?? '', 10) || new Date().getFullYear();

  if (!process.env.SEATGEEK_CLIENT_ID) {
    return NextResponse.json({ error: 'Ticket search is not configured (missing SEATGEEK_CLIENT_ID).' }, { status: 503 });
  }

  try {
    const plan = await planTicketSearch(away, home, seasonYear, qty);
    if (!plan) {
      return NextResponse.json({ error: `Couldn't find a ${away} at ${home} game for ${seasonYear}.` }, { status: 404 });
    }
    return NextResponse.json(plan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
