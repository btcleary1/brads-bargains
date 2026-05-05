import { EbayItem } from './ebay';

// eBay final value fee + payment processing (~15% total)
const EBAY_FEE_RATE = 0.15;

// Maximum shipping cost to exclude heavy/bulky items
const MAX_SHIPPING = 30;

// Price range worth flipping
const MIN_PRICE = 50;
const MAX_PRICE = 2000;

// Minimum seller requirements
const MIN_FEEDBACK_PERCENT = 95;  // below this = skip entirely
const MIN_FEEDBACK_COUNT   = 10;  // new sellers with few ratings = skip

export interface FilterPrefs {
  minPrice?: number;            // default 50
  maxPrice?: number;            // default 2000
  maxShipping?: number;         // default 30
  maxTechAgeYears?: number;     // 0 = no limit, default 2
  minSellerFeedbackPct?: number; // default 97
  minDiscountPct?: number;      // starting hot deal threshold, default 60
  allowedConditions?: string[]; // empty = use default (excludes Acceptable/For Parts/etc.)
  showLocalPickup?: boolean;    // default false — filter out local-pickup-only listings
}

// Title keywords that indicate junk listings
const JUNK_TITLE_PATTERNS = /for parts|not working|broken|cracked screen|read description|as.is|untested|powers on|no returns|damaged|water damage|print ad|framed poster|framed print|game poster|movie poster|art print|lithograph/i;

// Accessories and low-value add-ons not worth flipping
const ACCESSORY_PATTERNS = /\bstrap\b|watch band|\bcase\b|\bcover\b|screen protector|tempered glass|charger cable|\bcord\b|\badapter\b|car mount|phone mount|stand holder|game holder|card holder|lamp attachment|searchlight|burst light|\blight\b.*drone|drone.*\blight\b|\bskin\b.*phone|phone.*\bskin\b|keycap|wrist rest|\bposter\b/i;

// Clothing and fashion — not a category we cover
const FASHION_PATTERNS = /\bshoes?\b|\bheels?\b|\bsneakers?\b|\bboots?\b|\bsandals?\b|\bloafers?\b|\bflats?\b|\bpumps?\b|\bdress\b|\bblouse\b|\bjacket\b|\bcoat\b|\bsuit\b|\bjeans?\b|\bpants?\b|\bskirt\b|\bversace\b|\bgucci\b|\bprada\b|\blouisvuitton\b|\bchanel\b|\bhermes\b|\bburberry\b|\bbag\b.*leather|\bhandbag\b|\bpurse\b|\btote\b/i;

// Heavy/bulky items not worth storing or shipping
const BULKY_PATTERNS = /\bconsole\b|desktop|monitor|printer|treadmill|bicycle|bike\b|guitar|amplifier|furniture|mattress|refrigerator|washer|dryer|dishwasher|television|\bsofa\b|\bcouch\b|elliptical|weight bench|kayak|surfboard|scooter|electric bike|e-bike|hoverboard/i;

// Conditions to skip entirely
const BAD_CONDITIONS = /acceptable|for parts|parts only|refurbished|poor/i;

// Tech categories where device age matters
const TECH_PATTERNS = /iphone|ipad|macbook|laptop|galaxy\s+[sznf]|galaxy\s+note|galaxy\s+z|pixel\s+\d|pixel\s+fold|airpods|apple watch|playstation|ps[345]\b|xbox|nintendo switch|\b3ds\b/i;

// Sealed/unopened items command a resale premium — especially collectibles, games, LEGO, cards
const SEALED_PATTERNS = /\bsealed\b|factory.?sealed|unopened|shrink.?wrap|\bNIB\b|\bMISB\b|\bMIB\b|new.?in.?box|new.?in.?package|deadstock|new.?old.?stock|\bNOS\b/i;

// Max items per category in the final result (prevents all-iPhone digests)
const MAX_PER_CATEGORY = 4;

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
  // iPhone X-series (Roman numerals — must check before numeric match)
  if (/iPhone\s+XS\s+Max/i.test(title)) return 2018;
  if (/iPhone\s+X[SR]/i.test(title))    return 2018; // XS, XR
  if (/iPhone\s+X\b/i.test(title))      return 2017; // iPhone X

  const iphone = title.match(/iPhone\s+(\d+)/i);
  if (iphone) {
    const n = parseInt(iphone[1]);
    if (n >= 16) return 2024;
    if (n === 15) return 2023;
    if (n === 14) return 2022;
    if (n === 13) return 2021;
    if (n === 12) return 2020;
    if (n === 11) return 2019;
    return 2017; // iPhone 10 and older numeric models
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

// Map Samsung Galaxy model numbers to release year
function samsungModelYear(title: string): number | null {
  // Galaxy S series: S20=2020, S21=2021, S22=2022, S23=2023, S24=2024
  const s = title.match(/Galaxy\s+S(\d+)/i);
  if (s) {
    const n = parseInt(s[1]);
    if (n >= 24) return 2024;
    if (n === 23) return 2023;
    if (n === 22) return 2022;
    if (n === 21) return 2021;
    if (n === 20) return 2020;
    if (n === 10) return 2019;
    if (n === 9)  return 2018;
    return 2017; // S8 and older
  }

  // Galaxy Note series: Note9=2018, Note10=2019, Note20=2020
  const note = title.match(/Galaxy\s+Note\s*(\d+)/i);
  if (note) {
    const n = parseInt(note[1]);
    if (n === 20) return 2020;
    if (n === 10) return 2019;
    if (n === 9)  return 2018;
    if (n === 8)  return 2017;
    return 2016;
  }

  // Galaxy Z Fold: Fold=2019, Fold2=2020, Fold3=2021, Fold4=2022, Fold5=2023, Fold6=2024
  const fold = title.match(/Galaxy\s+Z\s+Fold\s*(\d*)/i);
  if (fold) {
    const n = fold[1] ? parseInt(fold[1]) : 1;
    if (n >= 6) return 2024;
    if (n === 5) return 2023;
    if (n === 4) return 2022;
    if (n === 3) return 2021;
    if (n === 2) return 2020;
    return 2019;
  }

  // Galaxy Z Flip: Flip=2020, Flip3=2021, Flip4=2022, Flip5=2023, Flip6=2024
  const flip = title.match(/Galaxy\s+Z\s+Flip\s*(\d*)/i);
  if (flip) {
    const n = flip[1] ? parseInt(flip[1]) : 1;
    if (n >= 6) return 2024;
    if (n === 5) return 2023;
    if (n === 4) return 2022;
    if (n === 3) return 2021;
    return 2020;
  }

  return null;
}

// Map Google Pixel model numbers to release year
function pixelModelYear(title: string): number | null {
  if (!/pixel/i.test(title)) return null;
  if (/Pixel\s+Fold/i.test(title)) return 2023;
  if (/Pixel\s+Tablet/i.test(title)) return 2023;
  // Pixel a-series: 3a=2019, 4a=2020, 5a=2021, 6a=2022, 7a=2023, 8a=2024
  const pa = title.match(/Pixel\s+(\d+)a/i);
  if (pa) {
    const n = parseInt(pa[1]);
    if (n >= 8) return 2024;
    if (n === 7) return 2023;
    if (n === 6) return 2022;
    if (n === 5) return 2021;
    if (n === 4) return 2020;
    return 2019;
  }
  // Standard Pixel: 6=2021, 7=2022, 8=2023, 9=2024
  const p = title.match(/Pixel\s+(\d+)/i);
  if (p) {
    const n = parseInt(p[1]);
    if (n >= 9) return 2024;
    if (n === 8) return 2023;
    if (n === 7) return 2022;
    if (n === 6) return 2021;
    if (n === 5) return 2020;
    if (n === 4) return 2019;
    if (n === 3) return 2018;
    return 2016;
  }
  return null;
}

// Map gaming console model names to release year
function consoleModelYear(title: string): number | null {
  // PlayStation
  if (/playstation|PS\d/i.test(title)) {
    if (/PS5|PlayStation\s*5/i.test(title)) return 2020;
    if (/PS4\s*Pro|PlayStation\s*4\s*Pro/i.test(title)) return 2016;
    if (/PS4|PlayStation\s*4/i.test(title)) return 2013;
    if (/PS3|PlayStation\s*3/i.test(title)) return 2006;
  }
  // Xbox
  if (/xbox/i.test(title)) {
    if (/Series\s*[XS]/i.test(title)) return 2020;
    if (/One\s*X\b/i.test(title)) return 2017;
    if (/One\s*S\b/i.test(title)) return 2016;
    if (/One\b/i.test(title)) return 2013;
    if (/360/i.test(title)) return 2005;
  }
  // Nintendo Switch
  if (/nintendo|switch/i.test(title)) {
    if (/Switch\s*OLED/i.test(title)) return 2021;
    if (/Switch\s*Lite/i.test(title)) return 2019;
    if (/Switch/i.test(title)) return 2017;
    if (/3DS\s*XL|New\s*3DS/i.test(title)) return 2014;
    if (/\b3DS\b/i.test(title)) return 2011;
    if (/Wii\s*U/i.test(title)) return 2012;
  }
  return null;
}

// Sealed/factory-new items sell faster and at a higher premium — especially collectibles and LEGO
function sealedBonus(item: EbayItem): number {
  const text = `${item.title} ${item.condition}`;
  if (!SEALED_PATTERNS.test(text)) return 0;
  // Higher bonus for collectible categories where sealed = significant price multiplier
  const isCollectible = /lego|pokemon|trading card|sports card|video game|nintendo|ps5|xbox|figure|funko|sneaker|jordan|dunk/i.test(text);
  return isCollectible ? 18 : 10;
}

// Boost recently listed items — fresh listings sell faster
function recencyBonus(listingDate: string | null): number {
  if (!listingDate) return 0;
  const ageHours = (Date.now() - new Date(listingDate).getTime()) / 3_600_000;
  if (ageHours <= 6)   return 20;
  if (ageHours <= 24)  return 15;
  if (ageHours <= 72)  return 8;
  if (ageHours <= 168) return 3; // up to 1 week
  return 0;
}

// Penalize old tech — old iPhones/iPads are hard to resell regardless of discount
// maxAgeYears: 0 = no age limit; default 2 = reject anything older than 2 years
function techAgePenalty(title: string, maxAgeYears = 2): number {
  if (maxAgeYears === 0) return 0;
  if (!TECH_PATTERNS.test(title)) return 0; // non-tech items (cards, LEGO) — no penalty

  // Try explicit year in title first (e.g. "2020 MacBook Air")
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const releaseYear = yearMatch ? parseInt(yearMatch[1]) : (appleModelYear(title) ?? samsungModelYear(title) ?? pixelModelYear(title) ?? consoleModelYear(title));
  if (!releaseYear) return 0;

  const age = CURRENT_YEAR - releaseYear;
  if (age <= maxAgeYears)     return 0;   // within allowed age
  if (age <= maxAgeYears + 1) return 10;  // 1 year over limit
  if (age <= maxAgeYears + 2) return 20;  // 2 years over limit
  if (age <= maxAgeYears + 3) return 30;  // 3 years over limit
  if (age <= maxAgeYears + 5) return 45;  // 4–5 years over limit
  return 60;                              // 6+ years over limit
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
// Accepts optional FilterPrefs to apply user-configured criteria
export function isJunk(item: EbayItem, prefs?: FilterPrefs): boolean {
  const minPrice    = prefs?.minPrice    ?? MIN_PRICE;
  const maxPrice    = prefs?.maxPrice    ?? MAX_PRICE;
  const maxShipping = prefs?.maxShipping ?? MAX_SHIPPING;
  const maxTechAge  = prefs?.maxTechAgeYears ?? 5;
  const minFeedPct  = prefs?.minSellerFeedbackPct ?? MIN_FEEDBACK_PERCENT;

  if (!item.imageUrl) return true;
  if (JUNK_TITLE_PATTERNS.test(item.title)) return true;
  if (ACCESSORY_PATTERNS.test(item.title)) return true;
  if (FASHION_PATTERNS.test(item.title)) return true;
  if (BULKY_PATTERNS.test(item.title)) return true;
  if (/refurbished/i.test(item.title)) return true;
  if (/\bpoor\b/i.test(item.title)) return true;

  // Condition: if user specified allowed conditions, check against them; else use defaults
  const allowed = prefs?.allowedConditions;
  if (allowed && allowed.length > 0) {
    const ok = allowed.some(c => item.condition.toLowerCase().includes(c.toLowerCase()));
    if (!ok) return true;
  } else {
    if (BAD_CONDITIONS.test(item.condition)) return true;
  }

  if (item.price < minPrice) return true;
  if (item.price > maxPrice) return true;
  if (item.shippingCost !== null && item.shippingCost > maxShipping) return true;

  // Seller feedback filter (skip check if we have no count data — new sellers handled elsewhere)
  const feedbackPct   = item.sellerFeedbackPercent ?? 100;
  const feedbackCount = item.sellerFeedbackScore   ?? 0;
  if (feedbackCount >= MIN_FEEDBACK_COUNT && feedbackPct < minFeedPct) return true;

  if (techAgePenalty(item.title, maxTechAge) > 0) return true;
  // Filter local-pickup-only listings unless user has opted in
  if (item.localPickupOnly && !prefs?.showLocalPickup) return true;
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

  return Math.max(0, quantityScore + demandScore + discountScore + uniquenessScore - agePenalty + recencyBonus(item.listingDate) + sealedBonus(item));
}

/**
 * Returns the model release year for an item, or null if unknown.
 * Checks explicit year in title first, then Apple model number mapping.
 */
export function modelYear(title: string): number | null {
  const yearMatch = title.match(/\b(20\d{2})\b/);
  if (yearMatch) return parseInt(yearMatch[1]);
  return appleModelYear(title);
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
  return Math.max(0, raw - techAgePenalty(item.title) + recencyBonus(item.listingDate) + sealedBonus(item));
}

/**
 * Filter to genuinely flippable deals, score them, return top N sorted best-first.
 * Caps MAX_PER_CATEGORY items per category for variety.
 */
export function topDeals(items: EbayItem[], n = 5, minDiscount = 60, prefs?: FilterPrefs): EbayItem[] {
  const clean = items.filter(i => !isJunk(i, prefs));

  const strictPass = clean.filter(i => {
    if (!i.discountPct || !i.marketPrice) return false;
    if (i.discountPct < minDiscount) return false;
    // Only reject on feedback when the API actually returned a value — summary
    // search endpoints don't include seller feedback, so null means unknown not bad
    if (i.sellerFeedbackPercent !== null && i.sellerFeedbackPercent < MIN_FEEDBACK_PERCENT) return false;
    if (i.sellerFeedbackScore   !== null && i.sellerFeedbackScore   < MIN_FEEDBACK_COUNT)   return false;
    return true;
  });

  // Fall back to items meeting the discount threshold but lacking marketPrice data
  const pool = strictPass.length >= n ? strictPass : clean.filter(i => {
    if ((i.discountPct ?? 0) < minDiscount) return false;
    if (i.sellerFeedbackPercent !== null && i.sellerFeedbackPercent < MIN_FEEDBACK_PERCENT) return false;
    if (i.sellerFeedbackScore   !== null && i.sellerFeedbackScore   < MIN_FEEDBACK_COUNT)   return false;
    return true;
  });

  const finalPool = pool;

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
