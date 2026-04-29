import type { TrackerDeal } from './tracker-data';
import { DIGEST_CATEGORIES } from './digest-categories';

const TITLE_PATTERNS: { pattern: RegExp; key: string }[] = [
  { pattern: /\biphone\b|\bgalaxy\s+s\d|\bpixel\s+\d|\bsmartphone\b/i,         key: 'cell_phones' },
  { pattern: /\bmacbook\b|\blaptop\b|\bthinkpad\b|\bdell\s+xps\b/i,            key: 'computers' },
  { pattern: /\bipad\b|\btablet\b/i,                                             key: 'computers' },
  { pattern: /\bairpod\b|\bheadphone\b|\bspeaker\b|\bsonos\b/i,                 key: 'consumer_elec' },
  { pattern: /\bapple\s+watch\b|\bsmartwatch\b|\bgarmin\b|\bfitbit\b/i,         key: 'consumer_elec' },
  { pattern: /\bdji\b|\bdrone\b/i,                                               key: 'cameras' },
  { pattern: /\bcamera\b|\blens\b|\bsony\s+a\d|\bcanon\s+r\b/i,                 key: 'cameras' },
  { pattern: /\bps5\b|\bplaystation\b|\bxbox\b|\bnintendo\b|\bswitch\b|\bvideo\s+game\b/i, key: 'video_games' },
  { pattern: /\bair\s+jordan\b|\bnike\s+dunk\b|\bdeadstock\b|\bsneaker\b|\bshoe\b/i, key: 'clothing' },
  { pattern: /\bdesigner\b|\bgucci\b|\blouis\s+vuitton\b|\bprada\b|\bcoach\b/i, key: 'clothing' },
  { pattern: /\brolex\b|\bomega\b|\bap\s+watch\b|\baudemars\b|\bpatek\b/i,       key: 'jewelry_watches' },
  { pattern: /\bjewelry\b|\bdiamond\b|\bgold\s+necklace\b|\bsapphire\b/i,        key: 'jewelry_watches' },
  { pattern: /\blego\b/i,                                                         key: 'toys_hobbies' },
  { pattern: /\bboard\s+game\b|\bfunko\b|\baction\s+figure\b/i,                  key: 'toys_hobbies' },
  { pattern: /\bcollectible\b|\bvintage\b|\brare\b|\bantique\b/i,                 key: 'collectibles' },
  { pattern: /\bpsa\b|\bsports?\s+card\b|\bbaseball\s+card\b|\bgraded\s+card\b/i, key: 'sports_cards' },
  { pattern: /\bpokemon\b|\bmagic\s+the\s+gathering\b|\bmtg\b/i,                 key: 'sports_cards' },
  { pattern: /\bgold\s+coin\b|\bsilver\s+coin\b|\bbullion\b|\bnumismatic\b/i,    key: 'coins' },
  { pattern: /\bgolf\b|\bbike\b|\bsurfboard\b|\bskis\b|\bfishing\b/i,            key: 'sporting_goods' },
  { pattern: /\bguitar\b|\bsynth\b|\bpiano\b|\bkeyboard\s+midi\b|\bdrum\b/i,     key: 'musical_inst' },
  { pattern: /\bdewalt\b|\bmilwaukee\b|\bpower\s+tool\b|\bdrills?\b/i,           key: 'tools_industrial' },
  { pattern: /\bappliance\b|\brobot\s+vacuum\b|\bdyson\b|\binstant\s+pot\b/i,    key: 'home_garden' },
  { pattern: /\bcomic\b|\bcgc\b|\bfirst\s+edition\b|\bhard\s+cover\b/i,          key: 'books_comics' },
  { pattern: /\bvinyl\b|\brecord\b|\balbum\s+sealed\b/i,                          key: 'music' },
  { pattern: /\bblu.?ray\b|\b4k\s+uhd\b/i,                                        key: 'dvds_movies' },
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
  ebayWatchedTitles: string[],
  ebayWonTitles: string[],
  trackerDeals: TrackerDeal[],
): Map<string, number> {
  const scores = new Map<string, number>();

  const add = (key: string, weight: number) => {
    scores.set(key, Math.min(1, (scores.get(key) ?? 0) + weight));
  };

  for (const key of explicitCategories) add(key, 1.0);

  for (const title of ebayWonTitles) {
    const key = categoryKeyForTitle(title);
    if (key) add(key, 0.7);
  }

  for (const title of ebayWatchedTitles) {
    const key = categoryKeyForTitle(title);
    if (key) add(key, 0.5);
  }

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
