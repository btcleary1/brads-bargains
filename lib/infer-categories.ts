import type { TrackerDeal } from './tracker-data';
import { DIGEST_CATEGORIES } from './digest-categories';

const TITLE_PATTERNS: { pattern: RegExp; key: string }[] = [
  { pattern: /\biphone\b/i, key: 'iphone' },
  { pattern: /\bmacbook\b/i, key: 'macbook' },
  { pattern: /\bipad\b/i, key: 'ipad' },
  { pattern: /\bapple\s+watch\b/i, key: 'watch' },
  { pattern: /\bairpod/i, key: 'airpods' },
  { pattern: /\bnintendo\b|\bswitch\s+oled\b/i, key: 'nintendo' },
  { pattern: /\bair\s+jordan\b|\baj\d/i, key: 'sneakers' },
  { pattern: /\bnike\s+dunk\b|\bdeadstock\b/i, key: 'deadstock' },
  { pattern: /\bpokemon\b/i, key: 'pokemon' },
  { pattern: /\bpsa\b|\bsports?\s+card\b|\bbaseball\s+card\b/i, key: 'sportcard' },
  { pattern: /\blego\b/i, key: 'lego' },
  { pattern: /\bcomic\b|\bcgc\b/i, key: 'comic' },
  { pattern: /\bdji\b|\bdrone\b/i, key: 'drone' },
  { pattern: /\bcamera\s+lens\b|\bsony\s+lens\b|\bcanon\s+lens\b/i, key: 'camera' },
  { pattern: /\bgold\s+coin\b|\bgold\s+bullion\b/i, key: 'gold' },
  { pattern: /\bsilver\s+coin\b|\bsilver\s+bullion\b/i, key: 'silver' },
  { pattern: /\bps5\b|\bxbox\s+series\b|\bvideo\s+game\b/i, key: 'games' },
  { pattern: /\bmechanical\s+keyboard\b/i, key: 'keyboard' },
  { pattern: /\bsunglasses\b/i, key: 'sunglasses' },
  { pattern: /\brolex\b|\bomega\s+watch\b/i, key: 'luxwatch' },
];

const VALID_KEYS = new Set(DIGEST_CATEGORIES.map(c => c.key));

export function inferCategoriesFromDeals(deals: TrackerDeal[]): string[] {
  const counts = new Map<string, number>();

  for (const deal of deals) {
    if (deal.category && VALID_KEYS.has(deal.category)) {
      counts.set(deal.category, (counts.get(deal.category) ?? 0) + 1);
      continue;
    }
    for (const { pattern, key } of TITLE_PATTERNS) {
      if (pattern.test(deal.title)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        break;
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

export function inferCategoryScores(
  explicitCategories: string[],
  ebayWatchedTitles: string[],   // watch list items — strong buying intent
  ebayWonTitles: string[],       // won/purchased items — strongest signal
  trackerDeals: TrackerDeal[],
): Map<string, number> {
  const scores = new Map<string, number>();

  const add = (key: string, weight: number) => {
    scores.set(key, Math.min(1, (scores.get(key) ?? 0) + weight));
  };

  // Explicit Settings selections: 1.0
  for (const key of explicitCategories) add(key, 1.0);

  // Won/purchased items: 0.7 (strongest revealed preference)
  for (const title of ebayWonTitles) {
    const key = categoryKeyForTitle(title);
    if (key) add(key, 0.7);
  }

  // Watched items: 0.5 (buying intent)
  for (const title of ebayWatchedTitles) {
    const key = categoryKeyForTitle(title);
    if (key) add(key, 0.5);
  }

  // Tracker inference: 0.3
  for (const deal of trackerDeals) {
    const key = (deal.category && VALID_KEYS.has(deal.category))
      ? deal.category
      : categoryKeyForTitle(deal.title);
    if (key) add(key, 0.3);
  }

  return scores;
}

export function categoryKeyForTitle(title: string): string | null {
  for (const { pattern, key } of TITLE_PATTERNS) {
    if (pattern.test(title)) return key;
  }
  return null;
}
