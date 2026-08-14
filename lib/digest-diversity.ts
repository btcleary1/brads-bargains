/**
 * Variety enforcement for digest selection.
 *
 * Selection ranks purely on profit and speed, so whenever one product type is
 * having a good day it can take most of the slots — a digest went out with three
 * of five items being wristwatches. Two things made that possible beyond the
 * ranking itself:
 *
 *   1. The only existing cap, MAX_PER_CATEGORY in deal-score.ts, runs inside
 *      topDeals() and never applies to the final digest selection or to the
 *      orchestrator's output.
 *   2. That cap classifies with CATEGORY_LIQUIDITY, whose only watch pattern is
 *      /apple watch|smartwatch/. A Seiko or Citizen falls through to 'other',
 *      as do tools, crafts and baby gear — so the cap could not see the run
 *      even where it did apply.
 *
 * This module owns a taxonomy that actually covers what the digest sources, and
 * a selector that spreads picks across it.
 */

export interface DiversityItem {
  itemId: string;
  title: string;
  category?: string;
}

/** Ordered most-specific first; the first match wins. */
const DIVERSITY_PATTERNS: { pattern: RegExp; key: string }[] = [
  { pattern: /\b(iphone|galaxy s\d|pixel \d|unlocked smartphone)\b/i,        key: 'phone' },
  { pattern: /\b(macbook|laptop|notebook pc|chromebook)\b/i,                 key: 'laptop' },
  { pattern: /\b(ipad|galaxy tab|tablet)\b/i,                                key: 'tablet' },
  { pattern: /\b(rtx|gtx|radeon|graphics card|gpu)\b/i,                      key: 'gpu' },
  { pattern: /\b(airpods|headphone|earbuds|soundbar|speaker)\b/i,            key: 'audio' },
  { pattern: /\b(playstation|ps[45]|xbox|nintendo|switch)\b/i,               key: 'gaming' },
  // Watches before jewelry and before 'vintage', and not limited to Apple —
  // the omission that let this bug through in the first place.
  { pattern: /\b(watch|seiko|citizen|rolex|omega|tissot|casio|g-shock|chronograph|timepiece)\b/i, key: 'watch' },
  { pattern: /\b(dslr|mirrorless|camera|camcorder|gopro|lens)\b/i,           key: 'camera' },
  { pattern: /\b(pokemon|psa \d+|sports card|trading card|graded card|topps|panini)\b/i, key: 'cards' },
  { pattern: /\blego\b/i,                                                    key: 'lego' },
  { pattern: /\b(funko|pop vinyl|action figure|collectible figure)\b/i,      key: 'figures' },
  { pattern: /\b(comic|cgc|marvel|dc comics)\b/i,                            key: 'comics' },
  { pattern: /\b(coin|silver eagle|bullion|numismatic|krugerrand)\b/i,       key: 'coins' },
  { pattern: /\b(jordan|nike|adidas|yeezy|sneaker|new balance)\b/i,          key: 'sneakers' },
  { pattern: /\b(dewalt|milwaukee|makita|ryobi|drill|impact driver|tool kit)\b/i, key: 'tools' },
  { pattern: /\b(guitar|fender|squier|stratocaster|synthesizer|keyboard piano|amplifier)\b/i, key: 'instruments' },
  { pattern: /\b(dyson|airwrap|kitchenaid|vacuum|stand mixer|air fryer)\b/i, key: 'home' },
  { pattern: /\b(cricut|silhouette cameo|sewing machine|embroidery)\b/i,     key: 'crafts' },
  { pattern: /\b(stroller|car seat|uppababy|bugaboo|bassinet)\b/i,           key: 'baby' },
  { pattern: /\b(blu-ray|4k uhd|steelbook|vinyl|lp record)\b/i,              key: 'media' },
  { pattern: /\b(ring|necklace|bracelet|earrings|gold chain)\b/i,            key: 'jewelry' },
];

/**
 * Bucket used for variety. Unrecognized titles hash into stable pseudo-buckets
 * rather than sharing one 'other' bucket, because a single catch-all would
 * either cap unrelated items against each other or, if exempted, let an entire
 * unclassified product type take every slot — which is the failure being fixed.
 */
export function diversityCategory(item: DiversityItem): string {
  const text = `${item.title} ${item.category ?? ''}`;
  for (const { pattern, key } of DIVERSITY_PATTERNS) {
    if (pattern.test(text)) return key;
  }
  // Group leftovers by their most distinctive title token so two unrelated
  // oddities do not collide, but three of the same oddity still do.
  const token = item.title
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length)[0];
  return token ? `other:${token}` : 'other';
}

const STOPWORDS = new Set([
  'used', 'new', 'with', 'from', 'this', 'that', 'good', 'great', 'lot', 'size',
  'condition', 'excellent', 'vintage', 'rare', 'original', 'genuine', 'authentic',
]);

export interface DiversifyOptions<T> {
  /** How many to return. */
  limit: number;
  /** Ranking signal; higher is better. Ties keep input order. */
  scoreOf: (item: T) => number;
  /** Bucket accessor. Defaults to diversityCategory. */
  categoryOf?: (item: T) => string;
  /**
   * Ceiling per bucket before relaxation. Two of five keeps a strong category
   * represented without letting it dominate.
   */
  maxPerCategory?: number;
}

/**
 * Picks `limit` items that span as many categories as the pool allows, taking
 * the strongest item from each before any category gets a second slot.
 *
 * Quality still leads: within every round the highest-scoring eligible item
 * wins, so this reorders rather than downgrades. If the cap cannot fill `limit`
 * — a thin pool, or genuinely only one category available — it relaxes rather
 * than returning a short digest, since sending four good items beats sending
 * three on a technicality.
 */
export function diversifySelection<T extends DiversityItem>(items: T[], opts: DiversifyOptions<T>): T[] {
  const { limit, scoreOf, categoryOf = diversityCategory, maxPerCategory = 2 } = opts;
  if (items.length <= 1 || limit <= 0) return items.slice(0, Math.max(0, limit));

  const ranked = [...items].sort((a, b) => scoreOf(b) - scoreOf(a));

  // Preserve rank order inside each bucket.
  const buckets = new Map<string, T[]>();
  for (const item of ranked) {
    const key = categoryOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  // Buckets compete in order of their best item, so the strongest category
  // still gets first pick overall.
  const order = [...buckets.entries()].sort((a, b) => scoreOf(b[1][0]) - scoreOf(a[1][0]));

  const picked: T[] = [];
  const takenFrom = new Map<string, number>();

  for (let round = 0; round < maxPerCategory && picked.length < limit; round++) {
    for (const [key, bucket] of order) {
      if (picked.length >= limit) break;
      const already = takenFrom.get(key) ?? 0;
      if (already > round) continue;      // already served this round
      const next = bucket[already];
      if (!next) continue;                // bucket exhausted
      picked.push(next);
      takenFrom.set(key, already + 1);
    }
  }

  // Top up ONLY from categories still under the cap. An earlier version relaxed
  // the cap here to avoid a short digest, which defeated the whole feature: with
  // three eligible items that were all guitar bodies, the rounds took two and this
  // block added the third. A repetitive digest is worse than a short one, so the
  // cap is absolute — running short is the correct outcome and gets logged.
  if (picked.length < limit) {
    const chosen = new Set(picked.map(i => i.itemId));
    for (const item of ranked) {
      if (picked.length >= limit) break;
      if (chosen.has(item.itemId)) continue;
      const key = categoryOf(item);
      if ((takenFrom.get(key) ?? 0) >= maxPerCategory) continue;
      picked.push(item);
      chosen.add(item.itemId);
      takenFrom.set(key, (takenFrom.get(key) ?? 0) + 1);
    }
  }

  // Return in quality order so the strongest item still leads the email.
  return picked.sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, limit);
}

/** One-line summary for logs, e.g. "watch×2, phone, gaming, coins". */
export function describeVariety<T extends DiversityItem>(
  items: T[],
  categoryOf: (item: T) => string = diversityCategory,
): string {
  const counts = new Map<string, number>();
  for (const i of items) {
    const k = categoryOf(i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
    .join(', ');
}
