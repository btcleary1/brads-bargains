// SeatGeek Platform API client — public, documented, read-only event/price search.
// Requires SEATGEEK_CLIENT_ID (free to register at seatgeek.com/build). No purchasing,
// no scraping — this only surfaces the same aggregate market data SeatGeek exposes publicly.

const SEATGEEK_BASE = 'https://api.seatgeek.com/2';

export interface TicketEvent {
  id: number;
  title: string;
  dateTimeLocal: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  url: string;
  lowestPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  listingCount: number | null;
}

function clientId(): string {
  const id = process.env.SEATGEEK_CLIENT_ID;
  if (!id) throw new Error('SEATGEEK_CLIENT_ID env var is not set.');
  return id;
}

function mapEvent(raw: any): TicketEvent {
  const stats = raw?.stats ?? {};
  return {
    id: raw.id,
    title: raw.title ?? raw.short_title ?? 'Unknown event',
    dateTimeLocal: raw.datetime_local ?? '',
    venueName: raw.venue?.name ?? 'Unknown venue',
    venueCity: raw.venue?.city ?? '',
    venueState: raw.venue?.state ?? '',
    url: raw.url ?? '',
    lowestPrice: stats.lowest_price ?? null,
    averagePrice: stats.average_price ?? null,
    highestPrice: stats.highest_price ?? null,
    listingCount: stats.listing_count ?? null,
  };
}

// Finds the best-matching event for a query like "LSU at Auburn football".
// Searches a window starting today through the end of the given season year (college
// football runs Aug–Jan, so the window spans into January of the following year).
export async function findEvent(query: string, seasonYear: number): Promise<TicketEvent | null> {
  const params = new URLSearchParams({
    client_id: clientId(),
    q: query,
    'datetime_local.gte': `${seasonYear}-01-01`,
    'datetime_local.lte': `${seasonYear + 1}-02-01`,
    per_page: '10',
    sort: 'datetime_local.asc',
  });

  const res = await fetch(`${SEATGEEK_BASE}/events?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`SeatGeek search failed: ${res.status}`);

  const data = await res.json();
  const events: any[] = data?.events ?? [];
  if (events.length === 0) return null;

  return mapEvent(events[0]);
}

export async function getEventById(eventId: number): Promise<TicketEvent | null> {
  const params = new URLSearchParams({ client_id: clientId() });
  const res = await fetch(`${SEATGEEK_BASE}/events/${eventId}?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return mapEvent(data);
}

// Deep links to marketplace search results for this event, pre-filtered by quantity
// where the platform supports it via query params. These point at real listing pages —
// we don't fabricate individual seat/row data we don't have a licensed feed for.
export function buildMarketplaceLinks(event: TicketEvent, quantity: number): { name: string; url: string }[] {
  const q = encodeURIComponent(`${event.title}`);
  return [
    { name: 'SeatGeek', url: event.url || `https://seatgeek.com/search?search=${q}` },
    { name: 'Vivid Seats', url: `https://www.vividseats.com/search?searchTerm=${q}&qty=${quantity}` },
    { name: 'Ticketmaster', url: `https://www.ticketmaster.com/search?q=${q}` },
  ];
}
