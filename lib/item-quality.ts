import { getEbayToken } from './ebay';

// Items must match at least one of these to be considered for Today's Picks / Email / Trending.
// This is a whitelist — anything not recognisably in a proven flip category is excluded.
const FLIPPABLE_RE = /\b(iphone|ipad|macbook|imac|airpods|apple\s+watch|samsung\s+galaxy|google\s+pixel|oneplus|playstation|ps5|ps4|xbox\s+series|nintendo\s+switch|rtx|gtx|radeon|rx\s+\d{4}|gpu|graphics\s+card|sony\s+alpha|canon\s+eos|nikon|fujifilm|mirrorless|dslr|air\s+jordan|jordan\s+\d|nike\s+dunk|yeezy|adidas\s+ultra|new\s+balance|pokemon|psa\s+\d+|bgs\s+\d+|sports\s+card|rookie\s+auto|lego|dewalt|milwaukee|makita|dyson|roomba|garmin|fitbit|apple\s+tv|roku|ring\s+doorbell|bose|sony\s+wh|sony\s+wf|beats\s+studio|sonos)\b/i;

export function isFlippableItem(title: string): boolean {
  return FLIPPABLE_RE.test(title);
}

// Signals in title or description that indicate a broken/damaged/non-functional item
const DAMAGE_RE = /\b(for\s+parts?|as[- ]is|broken|cracked|damaged|not\s+working|won'?t\s+(turn|power|boot)|no\s+power|dead\s+pixel|screen\s+(crack|damage|line|bleed|burn)|lines?\s+on\s+(screen|display)|display\s+(crack|damage|issue|problem|line)|liquid\s+damage|water\s+damage|flood\s+damage|bent\s+(frame|body|chassis)|icloud\s+lock|activation\s+lock|bad\s+esn|bad\s+imei|blacklist|touch\s+(not|issue|problem)|non[- ]functional|defective|faulty|parts?\s+only|read\s+description|spill|motherboard\s+(issue|damage)|charging\s+(port\s+)?issue|battery\s+(expand|swell|bad)|keyboard\s+(issue|damage|broken)|trackpad\s+(issue|broken)|no\s+backlight|dim\s+display|ghost\s+touch)\b/i;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s{2,}/g, ' ').trim();
}

async function fetchItemDescription(itemId: string): Promise<string | null> {
  try {
    const token = await getEbayToken();
    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.description ?? data.shortDescription ?? '';
    return raw ? stripHtml(raw) : null;
  } catch {
    return null;
  }
}

export interface QualityResult {
  broken: boolean;
  reason: string | null;
}

export async function checkItemQuality(itemId: string, title: string): Promise<QualityResult> {
  if (DAMAGE_RE.test(title)) {
    const match = title.match(DAMAGE_RE);
    return { broken: true, reason: `Title contains damage signal: "${match?.[0]}"` };
  }
  const description = await fetchItemDescription(itemId);
  if (description && DAMAGE_RE.test(description)) {
    const match = description.match(DAMAGE_RE);
    return { broken: true, reason: `Description mentions: "${match?.[0]}"` };
  }
  return { broken: false, reason: null };
}
