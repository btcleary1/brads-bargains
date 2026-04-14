import { EbayItem } from './ebay';

// eBay final value fee + payment processing (~15% total)
const EBAY_FEE_RATE = 0.15;

// Minimum absolute savings to be worth flipping
const MIN_SAVINGS = 75;

// Maximum shipping cost to exclude heavy/bulky items
const MAX_SHIPPING = 30;

// Minimum seller requirements
const MIN_FEEDBACK_PERCENT = 98;  // below this = skip entirely
const MIN_FEEDBACK_COUNT   = 25;  // new sellers with few ratings = skip

// Condition quality — affects resale price and ease of sale
const CONDITION_SCORE: Record<string, number> = {
  'New':        100,
  'Like New':    90,
  'Very Good':   75,
  'Good':        55,
  'Acceptable':  30,
};

function conditionScore(condition: string): number {
  for (const [key, val] of Object.entries(CONDITION_SCORE)) {
    if (condition.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 50;
}

// Category liquidity — how fast you can resell it
// Fast-moving = higher score
const CATEGORY_LIQUIDITY: { pattern: RegExp; score: number }[] = [
  { pattern: /iphone|samsung.*phone|pixel/i,              score: 100 },
  { pattern: /macbook|laptop/i,                           score: 95  },
  { pattern: /playstation|ps5|xbox/i,                     score: 90  },
  { pattern: /ipad|tablet/i,                              score: 85  },
  { pattern: /airpods|headphone|earbuds/i,                score: 80  },
  { pattern: /nintendo|switch/i,                          score: 80  },
  { pattern: /apple watch|smartwatch/i,                   score: 80  },
  { pattern: /drone|gopro|camera/i,                       score: 70  },
  { pattern: /pokemon|sports card|trading card/i,         score: 75  },
  { pattern: /basketball card|football card|baseball card/i, score: 70 },
  { pattern: /lego/i,                                     score: 65  },
  { pattern: /tv|television/i,                            score: 40  }, // heavy, hard to ship
  { pattern: /comic/i,                                    score: 50  },
  { pattern: /vintage|antique/i,                          score: 40  },
];

function liquidityScore(item: EbayItem): number {
  const text = `${item.title} ${item.category}`;
  for (const { pattern, score } of CATEGORY_LIQUIDITY) {
    if (pattern.test(text)) return score;
  }
  return 55; // default
}

// Seller trust score 0-100
function sellerScore(item: EbayItem): number {
  const pct   = item.sellerFeedbackPercent ?? 100;
  const count = item.sellerFeedbackScore   ?? 0;
  if (pct >= 99.5 && count >= 500) return 100;
  if (pct >= 99.0 && count >= 100) return 85;
  if (pct >= 98.5 && count >= 50)  return 70;
  if (pct >= 98.0 && count >= 25)  return 55;
  return 0; // below minimum — will be filtered out
}

// Net flip profit after eBay fees
function netProfit(item: EbayItem): number {
  if (!item.marketPrice) return 0;
  const salePrice = item.marketPrice * (1 - EBAY_FEE_RATE);
  const shippingCost = item.shippingCost ?? 0;
  return salePrice - item.price - shippingCost;
}

// Normalize net profit to 0-100 (capped at $1500 net profit)
function profitScore(item: EbayItem): number {
  return Math.min(netProfit(item) / 1500, 1) * 100;
}

/**
 * Score a deal 0-100 for buy-low-sell-high flipping.
 * Weights:
 *   45% - net flip profit after eBay fees (biggest driver)
 *   20% - seller reputation (trust gate)
 *   20% - condition (affects resale value and speed)
 *   10% - category liquidity (how fast it sells)
 *    5% - discount % (validates the deal is legit)
 */
export function scoreDeal(item: EbayItem): number {
  if (!item.discountPct || !item.marketPrice) return 0;

  const profitComponent    = profitScore(item)               * 0.45;
  const sellerComponent    = sellerScore(item)               * 0.20;
  const conditionComponent = conditionScore(item.condition)  * 0.20;
  const liquidityComponent = liquidityScore(item)            * 0.10;
  const discountComponent  = Math.min(item.discountPct, 100) * 0.05;

  return profitComponent + sellerComponent + conditionComponent + liquidityComponent + discountComponent;
}

/**
 * Filter to genuinely flippable deals, score them, return top N sorted best-first.
 * Hard filters:
 *   - 20%+ off market price (when available)
 *   - $10+ absolute savings (when marketPrice available)
 *   - Shipping <= $30 (avoid heavy/bulky items)
 *   - Seller >= 98% positive feedback with >= 25 ratings
 * Falls back to top-scored items with no discount filter when marketPrice is sparse.
 */
export function topDeals(items: EbayItem[], n = 5, minDiscount = 20): EbayItem[] {
  const strictPass = items.filter(i => {
    if (!i.discountPct || !i.marketPrice) return false;
    if (i.discountPct < minDiscount) return false;
    const savings = i.marketPrice - i.price;
    if (savings < 10) return false;
    if (i.shippingCost !== null && i.shippingCost > MAX_SHIPPING) return false;
    const pct   = i.sellerFeedbackPercent ?? 100;
    const count = i.sellerFeedbackScore   ?? 0;
    if (pct < MIN_FEEDBACK_PERCENT) return false;
    if (count < MIN_FEEDBACK_COUNT) return false;
    return true;
  });

  // Fall back to all items with decent seller ratings when marketPrice data is sparse
  const pool = strictPass.length >= n ? strictPass : items.filter(i => {
    if (i.shippingCost !== null && i.shippingCost > MAX_SHIPPING) return false;
    const pct   = i.sellerFeedbackPercent ?? 100;
    const count = i.sellerFeedbackScore   ?? 0;
    if (pct < MIN_FEEDBACK_PERCENT) return false;
    if (count < MIN_FEEDBACK_COUNT) return false;
    return true;
  });

  // Last resort — just take any items
  const finalPool = pool.length > 0 ? pool : items;

  return finalPool
    .map(i => ({ item: i, score: scoreDeal(i) + liquidityScore(i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.item);
}
