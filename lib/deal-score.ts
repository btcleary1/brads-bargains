import { EbayItem } from './ebay';

// Condition quality scores
const CONDITION_SCORE: Record<string, number> = {
  'New':       100,
  'Like New':  90,
  'Very Good': 75,
  'Good':      60,
  'Acceptable': 40,
};

function conditionScore(condition: string): number {
  for (const [key, val] of Object.entries(CONDITION_SCORE)) {
    if (condition.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 50; // unknown
}

// Normalize absolute savings to 0-100 scale relative to a $1000 cap
function savingsScore(item: EbayItem): number {
  if (!item.marketPrice) return 0;
  const savings = item.marketPrice - item.price;
  return Math.min(savings / 1000, 1) * 100;
}

/**
 * Score a deal 0–100.
 * Weights:
 *   40% — discount percentage (how deep the deal is)
 *   40% — absolute dollar savings (bigger savings = more opportunity)
 *   10% — condition quality
 *   10% — free shipping bonus
 */
export function scoreDeal(item: EbayItem): number {
  if (!item.discountPct || !item.marketPrice) return 0;

  const discountComponent  = Math.min(item.discountPct, 100) * 0.40;
  const savingsComponent   = savingsScore(item)              * 0.40;
  const conditionComponent = conditionScore(item.condition)  * 0.10;
  const shippingBonus      = (item.shippingCost === 0)       ? 10 : 0;

  return discountComponent + savingsComponent + conditionComponent + shippingBonus;
}

/**
 * Filter to hot deals (≥70% off), score them, return top N sorted best-first.
 */
export function topDeals(items: EbayItem[], n = 5, minDiscount = 70): EbayItem[] {
  return items
    .filter(i => i.discountPct !== null && i.discountPct >= minDiscount && i.marketPrice !== null)
    .map(i => ({ item: i, score: scoreDeal(i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.item);
}
