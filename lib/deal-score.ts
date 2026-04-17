import { EbayItem } from './ebay';

// eBay final value fee + payment processing (~15% total)
const EBAY_FEE_RATE = 0.15;

// Maximum shipping cost to exclude heavy/bulky items
const MAX_SHIPPING = 30;

// Price range worth flipping
const MIN_PRICE = 50;
const MAX_PRICE = 2000;

// Minimum seller requirements
const MIN_FEEDBACK_PERCENT = 97;  // below this = skip entirely
const MIN_FEEDBACK_COUNT   = 10;  // new sellers with few ratings = skip

// Title keywords that indicate junk listings
const JUNK_TITLE_PATTERNS = /for parts|not working|broken|cracked screen|read description|as.is|untested|powers on|no returns|damaged|water damage|print ad|framed poster|framed print|game poster|movie poster|art print|lithograph/i;

// Accessories and low-value add-ons not worth flipping
const ACCESSORY_PATTERNS = /\bstrap\b|watch band|\bcase\b|\bcover\b|screen protector|tempered glass|charger cable|\bcord\b|\badapter\b|car mount|phone mount|stand holder|game holder|card holder|lamp attachment|searchlight|burst light|\blight\b.*drone|drone.*\blight\b|\bskin\b.*phone|phone.*\bskin\b|keycap|wrist rest|\bposter\b/i;

// Heavy/bulky items not worth storing or shipping
const BULKY_PATTERNS = /\bconsole\b|desktop|monitor|printer|treadmill|bicycle|bike\b|guitar|amplifier|furniture|mattress|refrigerator|washer|dryer|dishwasher|television|\bsofa\b|\bcouch\b|elliptical|weight bench|kayak|surfboard|scooter|electric bike|e-bike|hoverboard/i;

// Conditions to skip entirely
const BAD_CONDITIONS = /acceptable|for parts|parts only|refurbished|poor/i;

// Tech categories where device age matters
const TECH_PATTERNS = /iphone|ipad|macbook|laptop|samsung|pixel|airpods|apple watch|playstation|xbox|nintendo/i;

// Max items per category in the final result (prevents all-iPhone digests)
const MAX_PER_CATEGORY = 2;

// Condition quality — affects resale price and ease of sale
const CONDITION_SCORE: Record<string, number> = {
  'New':        100,
  'Like New':    90,
  'Very Good':   75,
  'Good':        55,
  'Acceptable':  30,
};

const CURRENT_YEAR = 2026;

// Map Apple model numbers to release year (no year in title like "iPhone 13")
function appleModelYear(title: string): number | null {
  const iphone = title.match(/iPhone\s+(\d+)/i);
  if (iphone) {
    const n = parseInt(iphone[1]);
    if (n >= 16) return 2024;
    if (n === 15) return 2023;
    if (n === 14) return 2022;
    if (n === 13) return 2021;
    if (n === 12) return 2020;
    if (n === 11) return 2019;
    return 2017; // iPhone X and older
  }

  // iPhone SE by generation
  if (/iPhone SE/i.test(title)) {
    if (/3rd|gen\s*3/i.test(title)) return 2022;
    if (/2nd|gen\s*2/i.test(title)) return 2020;
    return 2016; // 1st gen SE
  }

  // iPad Pro with screen size (not generation number) — old models
  if (/iPad Pro\s+(?:9\.7|10\.5)/i.test(title)) return 2017;
  if (/iPad Pro\s+(?:12\.9)/i.test(title)) return 2015; // 1st/2nd gen 12.9"

  // iPad: guard against screen-size numbers (10.5", 12.9") — only match bare generation numbers
  // "iPad Pro 10.5" should NOT match as gen-10; check no decimal follows
  const ipad = title.match(/iPad(?:\s+(?:Pro|Air|Mini))?\s+(\d+)(?!\s*[."])/i);
  if (ipad) {
    const n = parseInt(ipad[1]);
    if (n >= 10) return 2022;
    if (n === 9)  return 2021;
    if (n === 8)  return 2020;
    if (n === 7)  return 2019;
    return 2018; // iPad 6th gen and older
  }

  // Apple Watch SE and series number
  if (/Apple Watch/i.test(title)) {
    if (/Watch Ultra/i.test(title)) return 2022; // Ultra 1st gen 2022, Ultra 2 2023
    if (/SE.*2nd|2nd.*SE/i.test(title)) return 2022;
    if (/Watch SE/i.test(title)) return 2021; // SE 1st gen 2020/2021
    const watch = title.match(/Apple Watch(?:\s+Series)?\s+(\d+)/i);
    if (watch) {
      const n = parseInt(watch[1]);
      if (n >= 10) return 2024;
      if (n === 9)  return 2023;
      if (n === 8)  return 2022;
      if (n === 7)  return 2021;
      if (n === 6)  return 2020;
      if (n === 5)  return 2019;
      if (n === 4)  return 2018;
      return 2017;
    }
  }

  // AirPods generation
  if (/airpods/i.test(title)) {
    if (/AirPods.*4th|4th.*AirPods/i.test(title)) return 2024;
    if (/AirPods Pro.*2nd|AirPods Pro 2\b|2nd.*AirPods Pro/i.test(title)) return 2022;
    if (/AirPods.*3rd|3rd.*AirPods/i.test(title)) return 2021;
    if (/AirPods Pro.*1st|AirPods Pro\b(?!.*2nd)/i.test(title)) return 2019;
    if (/AirPods.*2nd|2nd.*AirPods/i.test(title)) return 2019;
    return 2019; // default old AirPods
  }

  // MacBook chip generation (M-series or Intel)
  if (/macbook/i.test(title)) {
    if (/\bM4\b/i.test(title)) return 2024;
    if (/\bM3\b/i.test(title)) return 2023;
    if (/\bM2\b/i.test(title)) return 2022;
    if (/\bM1\b/i.test(title)) return 2020;
    // Intel MacBooks — older; treat as 2018 unless explicit year found
    if (/\bi[357][-\s]/i.test(title) || /\bA1\d{3}\b/.test(title)) return 2017;
  }

  return null;
}

// Penalize old tech — old iPhones/iPads are hard to resell regardless of discount
function techAgePenalty(title: string): number {
  if (!TECH_PATTERNS.test(title)) return 0; // non-tech items (cards, LEGO) — no penalty

  // Try explicit year in title first (e.g. "2020 MacBook Air")
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const releaseYear = yearMatch ? parseInt(yearMatch[1]) : appleModelYear(title);
  if (!releaseYear) return 0;

  const age = CURRENT_YEAR - releaseYear;
  if (age <= 2) return 0;   // 2024-2026: current gen
  if (age <= 3) return 10;  // 2023: minor penalty
  if (age <= 4) return 20;  // 2022: two gens back
  if (age <= 5) return 30;  // 2021: aging
  if (age <= 7) return 45;  // 2019-2020: significantly dated
  return 60;                // 2018 and older: very hard to resell
}

function conditionScore(condition: string): number {
  for (const [key, val] of Object.entries(CONDITION_SCORE)) {
    if (condition.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 50;
}

// Category liquidity — how fast you can resell it
const CATEGORY_LIQUIDITY: { pattern: RegExp; score: number; label: string }[] = [
  { pattern: /iphone|samsung.*phone|pixel/i,                 score: 100, label: 'phone'    },
  { pattern: /macbook|laptop/i,                              score: 95,  label: 'laptop'   },
  { pattern: /playstation|ps5|xbox/i,                        score: 90,  label: 'gaming'   },
  { pattern: /ipad|tablet/i,                                 score: 85,  label: 'tablet'   },
  { pattern: /airpods|headphone|earbuds/i,                   score: 80,  label: 'audio'    },
  { pattern: /nintendo|switch/i,                             score: 80,  label: 'gaming'   },
  { pattern: /apple watch|smartwatch/i,                      score: 80,  label: 'watch'    },
  { pattern: /drone|gopro|camera/i,                          score: 70,  label: 'camera'   },
  { pattern: /pokemon|sports card|trading card/i,            score: 75,  label: 'cards'    },
  { pattern: /basketball card|football card|baseball card/i, score: 70,  label: 'cards'    },
  { pattern: /lego/i,                                        score: 65,  label: 'lego'     },
  { pattern: /tv|television/i,                               score: 40,  label: 'tv'       },
  { pattern: /comic/i,                                       score: 50,  label: 'comic'    },
  { pattern: /vintage|antique/i,                             score: 40,  label: 'vintage'  },
];

function liquidityScore(item: EbayItem): number {
  const text = `${item.title} ${item.category}`;
  for (const { pattern, score } of CATEGORY_LIQUIDITY) {
    if (pattern.test(text)) return score;
  }
  return 55;
}

function categoryLabel(item: EbayItem): string {
  const text = `${item.title} ${item.category}`;
  for (const { pattern, label } of CATEGORY_LIQUIDITY) {
    if (pattern.test(text)) return label;
  }
  return 'other';
}

// Seller trust score 0-100
function sellerScore(item: EbayItem): number {
  const pct   = item.sellerFeedbackPercent ?? 100;
  const count = item.sellerFeedbackScore   ?? 0;
  if (pct >= 99.5 && count >= 500) return 100;
  if (pct >= 99.0 && count >= 100) return 85;
  if (pct >= 99.0 && count >= 50)  return 70;
  return 0;
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

// Hard filter — returns true if item should be excluded
function isJunk(item: EbayItem): boolean {
  if (!item.imageUrl) return true;
  if (JUNK_TITLE_PATTERNS.test(item.title)) return true;
  if (ACCESSORY_PATTERNS.test(item.title)) return true;
  if (BULKY_PATTERNS.test(item.title)) return true;
  if (/refurbished/i.test(item.title)) return true;
  if (/\bpoor\b/i.test(item.title)) return true;  // "Used Poor" condition in title
  if (BAD_CONDITIONS.test(item.condition)) return true;
  if (item.price < MIN_PRICE) return true;
  if (item.price > MAX_PRICE) return true;
  if (item.shippingCost !== null && item.shippingCost > MAX_SHIPPING) return true;
  // Reject Apple electronics older than 2 years — too old to flip profitably
  if (techAgePenalty(item.title) > 0) return true;
  return false;
}

/**
 * Sellability confidence score 0-100.
 * Answers: "How likely am I to actually resell this?"
 * Based on 4 signals — no extra API calls needed.
 */
export function sellabilityScore(item: EbayItem, allItems: EbayItem[]): number {
  // 1. Quantity scarcity (30pts) — single item = scarce = easier to sell at good price
  const qty = item.quantity ?? 1;
  const quantityScore = qty <= 1 ? 30 : qty <= 3 ? 20 : qty <= 10 ? 10 : 0;

  // 2. Category demand (25pts) — how fast this category moves on eBay
  const demand = liquidityScore(item);
  const demandScore = Math.round((demand / 100) * 25);

  // 3. Discount depth (25pts) — deeper discount = stronger signal it's a genuine deal
  const pct = item.discountPct ?? 0;
  const discountScore = pct >= 80 ? 25 : pct >= 70 ? 20 : pct >= 60 ? 14 : pct >= 50 ? 8 : 3;

  // 4. Price uniqueness (20pts) — is this priced lower than all similar items in results?
  const similar = allItems.filter(i =>
    i.itemId !== item.itemId &&
    i.title.toLowerCase().split(' ').slice(0, 3).join(' ') ===
    item.title.toLowerCase().split(' ').slice(0, 3).join(' ')
  );
  const cheaperCount = similar.filter(i => i.price <= item.price).length;
  const uniquenessScore = similar.length === 0 ? 20 : cheaperCount === 0 ? 20 : cheaperCount <= 1 ? 12 : 4;

  const agePenalty = techAgePenalty(item.title);

  return Math.max(0, quantityScore + demandScore + discountScore + uniquenessScore - agePenalty);
}

export function sellabilityLabel(score: number): { label: string; color: string; bg: string; border: string } {
  if (score >= 70) return { label: 'High Confidence',   color: '#16A34A', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)'   };
  if (score >= 45) return { label: 'Medium Confidence', color: '#D97706', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  };
  return              { label: 'Lower Confidence',  color: '#DC2626', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'  };
}

/**
 * Score a deal 0-100 for buy-low-sell-high flipping.
 */
export function scoreDeal(item: EbayItem): number {
  if (!item.discountPct || !item.marketPrice) return 0;

  const profitComponent    = profitScore(item)               * 0.45;
  const sellerComponent    = sellerScore(item)               * 0.20;
  const conditionComponent = conditionScore(item.condition)  * 0.20;
  const liquidityComponent = liquidityScore(item)            * 0.10;
  const discountComponent  = Math.min(item.discountPct, 100) * 0.05;

  const raw = profitComponent + sellerComponent + conditionComponent + liquidityComponent + discountComponent;
  return Math.max(0, raw - techAgePenalty(item.title));
}

/**
 * Filter to genuinely flippable deals, score them, return top N sorted best-first.
 * Caps MAX_PER_CATEGORY items per category for variety.
 */
export function topDeals(items: EbayItem[], n = 5, minDiscount = 60): EbayItem[] {
  const clean = items.filter(i => !isJunk(i));

  const strictPass = clean.filter(i => {
    if (!i.discountPct || !i.marketPrice) return false;
    if (i.discountPct < minDiscount) return false;
    const pct   = i.sellerFeedbackPercent ?? 100;
    const count = i.sellerFeedbackScore   ?? 0;
    if (pct < MIN_FEEDBACK_PERCENT) return false;
    if (count < MIN_FEEDBACK_COUNT) return false;
    return true;
  });

  // Fall back to clean items with decent seller ratings when discount data is sparse
  const pool = strictPass.length >= n ? strictPass : clean.filter(i => {
    const pct   = i.sellerFeedbackPercent ?? 100;
    const count = i.sellerFeedbackScore   ?? 0;
    if (pct < MIN_FEEDBACK_PERCENT) return false;
    if (count < MIN_FEEDBACK_COUNT) return false;
    return true;
  });

  const finalPool = pool.length > 0 ? pool : clean;

  // Score and sort
  const scored = finalPool
    .map(i => ({ item: i, score: scoreDeal(i) + liquidityScore(i) }))
    .sort((a, b) => b.score - a.score);

  // Pick top N with category cap and title deduplication
  const result: EbayItem[] = [];
  const categoryCounts: Record<string, number> = {};
  const titleKeys = new Set<string>();
  for (const { item } of scored) {
    const cat = categoryLabel(item);
    const count = categoryCounts[cat] ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;
    // Skip near-duplicate titles (first 5 words match an already-picked item)
    const titleKey = item.title.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
    if (titleKeys.has(titleKey)) continue;
    categoryCounts[cat] = count + 1;
    titleKeys.add(titleKey);
    result.push(item);
    if (result.length >= n) break;
  }

  // If category cap left us short, fill from remaining
  if (result.length < n) {
    const picked = new Set(result.map(i => i.itemId));
    for (const { item } of scored) {
      if (!picked.has(item.itemId)) {
        const titleKey = item.title.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
        if (titleKeys.has(titleKey)) continue;
        titleKeys.add(titleKey);
        result.push(item);
        if (result.length >= n) break;
      }
    }
  }

  return result;
}
