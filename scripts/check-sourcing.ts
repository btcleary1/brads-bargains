/**
 * Guards the sourcing list against the filters that run downstream of it.
 *
 * Three separate incidents came from DIGEST_CATEGORIES and the filters disagreeing,
 * each of which silently starved the digest rather than failing loudly:
 *
 *   1. Eight product families were added to sourcing but not to the FLIPPABLE_RE
 *      whitelist, so everything those searches returned was discarded.
 *   2. Ceilings of 45 and 40 were set for coins, DVDs and vinyl while isJunk
 *      enforces a $50 floor, so those three categories could never yield an item.
 *   3. maxTechAgeYears defaulted to 2, which by 2026 rejected every electronics
 *      category the app deliberately searches for.
 *
 * Each one is invisible in production: the digest just gets smaller. This asserts
 * that a representative listing for every sourced category actually survives.
 *
 * Run: npx tsx scripts/check-sourcing.ts
 */
import { DIGEST_CATEGORIES } from '../lib/digest-categories';
import { isJunk, MAX_TECH_AGE_YEARS } from '../lib/deal-score';
import { isFlippableItem } from '../lib/item-quality';
import type { EbayItem } from '../lib/ebay';

/** A listing each category would plausibly return. Keep in step with the queries. */
const SAMPLES: Record<string, string> = {
  cell_phones: 'Apple iPhone 13 128GB Unlocked Very Good',
  cell_phones_15: 'Apple iPhone 15 128GB Unlocked',
  computers: 'Apple MacBook Air M1 256GB Space Gray',
  computers_ipad: 'Apple iPad Air 4th Gen 64GB Wi-Fi',
  consumer_elec: 'Apple AirPods Pro 2nd Generation',
  rtx_gpu: 'NVIDIA GeForce RTX 3070 Founders Edition',
  cameras: 'Canon EOS Rebel T7 DSLR Camera Body',
  sony_camera: 'Sony Alpha a6000 Mirrorless Camera Body',
  video_games: 'Nintendo Switch OLED Console White',
  video_games_ps5: 'Sony PlayStation 5 Disc Edition',
  sports_cards: 'Pokemon Charizard PSA 10',
  sports_card_psa: 'Michael Jordan PSA 10 Graded Card',
  toys_hobbies: 'LEGO 10276 Colosseum Sealed Retired',
  lego_sealed: 'LEGO Star Wars 75192 New In Box',
  collectibles: 'Funko Pop Vaulted Exclusive Batman',
  books_comics: 'Amazing Spider-Man CGC 9.8 Key Issue',
  coins: '2021 American Silver Eagle BU Coin',
  sporting_goods: 'Air Jordan 1 Retro High OG Size 10',
  jordan_shoes: 'Air Jordan 4 Retro Sneakers Size 10',
  tools_industrial: 'DeWalt 20V MAX Cordless Drill Kit',
  dewalt_tool: 'DeWalt 20V MAX Combo Kit 2 Tool',
  jewelry_watches: 'Seiko Automatic Dive Watch SKX007',
  home_garden: 'KitchenAid Artisan Stand Mixer',
  health_beauty: 'Dyson Airwrap Complete Styler',
  crafts: 'Cricut Maker Cutting Machine',
  baby: 'UPPAbaby Vista V2 Stroller',
  dvds_movies: 'Blade Runner 4K UHD Steelbook Boxset Sealed',
  music: 'Pink Floyd Dark Side Vinyl LP Box Set Sealed',
};

const MIN_PRICE_FLOOR = 50; // mirrors MIN_PRICE in lib/deal-score.ts

function listing(title: string, price: number): EbayItem {
  return {
    itemId: 'test', title, price, currency: 'USD', marketPrice: price * 2,
    discountPct: 55, condition: 'Used', imageUrl: 'https://i.ebayimg.com/x.jpg',
    additionalImages: [], itemUrl: '', seller: 'seller',
    sellerFeedbackScore: 500, sellerFeedbackPercent: 99, location: 'US',
    category: '', shippingCost: 5, localPickupOnly: false,
    listingType: 'FIXED_PRICE', listingDate: null, quantity: 1,
  } as EbayItem;
}

const failures: string[] = [];

for (const cat of DIGEST_CATEGORIES) {
  const title = SAMPLES[cat.key];
  if (!title) {
    failures.push(`${cat.key}: no sample listing — add one to scripts/check-sourcing.ts`);
    continue;
  }

  // A ceiling at or below the floor means every result is rejected on price alone.
  if (cat.maxPrice != null && cat.maxPrice <= MIN_PRICE_FLOOR) {
    failures.push(`${cat.key}: maxPrice ${cat.maxPrice} is at or below the $${MIN_PRICE_FLOOR} MIN_PRICE floor — this category can never yield an item`);
    continue;
  }

  const price = cat.maxPrice ? cat.maxPrice - 5 : 150;

  if (!isFlippableItem(title)) {
    failures.push(`${cat.key}: "${title}" is not matched by FLIPPABLE_RE in lib/item-quality.ts`);
  }
  if (isJunk(listing(title, price), { maxTechAgeYears: MAX_TECH_AGE_YEARS })) {
    failures.push(`${cat.key}: "${title}" at $${price} is rejected by isJunk`);
  }
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} sourced categor${failures.length === 1 ? 'y' : 'ies'} cannot produce an item:\n`);
  failures.forEach(f => console.error(`  - ${f}`));
  console.error('\nEither fix the filter or drop the category. A category that cannot');
  console.error('yield anything is invisible in production — the digest just shrinks.\n');
  process.exit(1);
}

console.log(`✓ all ${DIGEST_CATEGORIES.length} sourced categories survive the whitelist, junk filter and price floor`);
