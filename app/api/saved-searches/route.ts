import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getSavedSearches, saveSavedSearches, SavedSearch } from '@/lib/tracker-data';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const searches = await getSavedSearches(session.userId);
  return NextResponse.json({ searches });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { query, minDiscount = 60 } = await req.json();
  if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 });

  const searches = await getSavedSearches(session.userId);
  if (searches.some(s => s.query.toLowerCase() === query.trim().toLowerCase())) {
    return NextResponse.json({ error: 'Already watching this search' }, { status: 409 });
  }

  const newSearch: SavedSearch = {
    id: randomUUID(),
    query: query.trim(),
    minDiscount,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastNotifiedIds: [],
  };
  await saveSavedSearches(session.userId, [...searches, newSearch]);
  return NextResponse.json({ search: newSearch });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const searches = await getSavedSearches(session.userId);
  await saveSavedSearches(session.userId, searches.filter(s => s.id !== id));
  return NextResponse.json({ ok: true });
}
