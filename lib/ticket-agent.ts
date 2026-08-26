// Ticket-finding agent — given a matchup and a group size, resolves the real event via
// SeatGeek, then reasons about a "reasonable middle" price band (skip the cheapest
// obstructed-view seats and the priciest premium sections) and how a group that size
// realistically splits into blocks that sit together. Read-only: it recommends where to
// look and what to expect, it never purchases anything.

import Anthropic from '@anthropic-ai/sdk';
import { findEvent, buildMarketplaceLinks, TicketEvent } from './tickets';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface SeatGroup {
  size: number;
  targetPricePerSeat: number;
  note: string;
}

export interface TicketPlan {
  event: TicketEvent;
  totalRequested: number;
  priceBandLow: number;
  priceBandHigh: number;
  groups: SeatGroup[];
  reasoning: string;
  marketplaceLinks: { name: string; url: string }[];
}

// Deterministic fallback used when Claude is unavailable — still a sound plan,
// just without the written rationale.
function fallbackPlan(event: TicketEvent, totalRequested: number): TicketPlan {
  const low = event.lowestPrice ?? 0;
  const high = event.highestPrice ?? (event.averagePrice ? event.averagePrice * 2 : 0);
  const spread = Math.max(high - low, 0);
  // Middle band: skip the bottom ~20% (obstructed/nosebleed) and top ~25% (premium) of the range.
  const bandLow = Math.round(low + spread * 0.2);
  const bandHigh = Math.round(low + spread * 0.75);

  const groups = splitIntoGroups(totalRequested, event.averagePrice ?? Math.round((bandLow + bandHigh) / 2));

  return {
    event,
    totalRequested,
    priceBandLow: bandLow,
    priceBandHigh: bandHigh,
    groups,
    reasoning: `Targeting the middle of the market: $${bandLow}–$${bandHigh} per seat, skipping the cheapest obstructed-view section and the priciest premium sections. A block of ${totalRequested} together in one section is uncommon, so split into smaller groups seated near each other.`,
    marketplaceLinks: buildMarketplaceLinks(event, totalRequested),
  };
}

function splitIntoGroups(total: number, pricePerSeat: number): SeatGroup[] {
  // Contiguous blocks of 15 are rare inventory; most marketplaces realistically offer
  // runs of 2-8 seats together. Split into the fewest even groups of size <= 8.
  const maxGroupSize = 8;
  const groupCount = Math.ceil(total / maxGroupSize);
  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;

  const groups: SeatGroup[] = [];
  for (let i = 0; i < groupCount; i++) {
    const size = base + (i < remainder ? 1 : 0);
    groups.push({
      size,
      targetPricePerSeat: pricePerSeat,
      note: groupCount > 1 ? `Group ${i + 1} of ${groupCount} — same section/adjacent rows if possible` : 'One contiguous block',
    });
  }
  return groups;
}

export async function planTicketSearch(
  awayTeam: string,
  homeTeam: string,
  seasonYear: number,
  totalRequested = 15,
): Promise<TicketPlan | null> {
  const event = await findEvent(`${awayTeam} at ${homeTeam}`, seasonYear);
  if (!event) return null;

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackPlan(event, totalRequested);
  }

  const stats = [
    event.lowestPrice != null ? `lowest listed: $${event.lowestPrice}` : null,
    event.averagePrice != null ? `average: $${event.averagePrice}` : null,
    event.highestPrice != null ? `highest listed: $${event.highestPrice}` : null,
    event.listingCount != null ? `${event.listingCount} listings currently tracked` : null,
  ].filter(Boolean).join(', ');

  const prompt = `You are helping a fan find ${totalRequested} tickets to "${event.title}" at ${event.venueName}, ${event.venueCity}, ${event.venueState} on ${event.dateTimeLocal}.

Current market data (SeatGeek aggregate): ${stats || 'no stats available'}.

Goal: seats close together, at a REASONABLE price — explicitly not the cheapest (often obstructed-view or student/visitor-only end zone) and not the most expensive (club/premium sections). Aim for the middle of the market.

Since ${totalRequested} contiguous seats in one section is uncommon in real inventory, split the request into realistic same-section-or-adjacent groups of at most 8 seats each that sum to ${totalRequested}.

Respond with ONLY a JSON object:
{
  "priceBandLow": <number, per-seat USD>,
  "priceBandHigh": <number, per-seat USD>,
  "groups": [ { "size": <number>, "targetPricePerSeat": <number>, "note": "<short seating guidance>" }, ... ],
  "reasoning": "<2-3 sentences explaining the price band and grouping choice, reference the actual market numbers>"
}
Groups must sum to exactly ${totalRequested}.`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = res.content.find(b => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return fallbackPlan(event, totalRequested);

    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      priceBandLow: number;
      priceBandHigh: number;
      groups: SeatGroup[];
      reasoning: string;
    };

    const sum = parsed.groups.reduce((a, g) => a + g.size, 0);
    if (sum !== totalRequested || parsed.groups.length === 0) return fallbackPlan(event, totalRequested);

    return {
      event,
      totalRequested,
      priceBandLow: parsed.priceBandLow,
      priceBandHigh: parsed.priceBandHigh,
      groups: parsed.groups,
      reasoning: parsed.reasoning,
      marketplaceLinks: buildMarketplaceLinks(event, totalRequested),
    };
  } catch {
    return fallbackPlan(event, totalRequested);
  }
}
