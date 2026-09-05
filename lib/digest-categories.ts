export interface DigestCategory {
  key: string;
  label: string;
  query: string;
  categoryId: string;
  maxPrice?: number;
}

// Two rules govern this list, both learned the hard way:
//
// 1. Queries must name a specific, liquid product. Vague searches like
//    "collectible rare vintage" return one-off oddities with two or three sold
//    comps, which can never clear the comp-count bar in lib/flip-verdict.ts and
//    which price unpredictably. Specific models have deep comp history.
//
// 2. Every entry needs a maxPrice ceiling set roughly 25-35% below typical
//    resale. eBay has no "underpriced" filter, so the ceiling is the only thing
//    that biases results toward listings that can actually flip. Without it the
//    API returns items priced at or above market and every one comps out
//    negative — which is exactly what digests were full of.
//
// categoryId is a hard filter on the eBay Browse API: a wrong ID returns zero
// results, so only IDs already validated in production appear here.
//
// 3. Every maxPrice must sit ABOVE the $50 MIN_PRICE floor in lib/deal-score.ts.
//    Ceilings of 45 and 40 were set here for coins, DVDs and vinyl, so every
//    result those searches returned was rejected on price before it was ever
//    priced. scripts/check-sourcing.ts fails the build if that recurs.
export const DIGEST_CATEGORIES: DigestCategory[] = [
  // ── Electronics: deepest comp history, fastest turnover ──────────────────
  { key: 'cell_phones',       label: 'Cell Phones & Accessories',        query: 'iPhone 13 unlocked used',                categoryId: '15032', maxPrice: 220 },
  { key: 'cell_phones_15',    label: 'Cell Phones — Current Gen',        query: 'iPhone 15 unlocked used',                categoryId: '15032', maxPrice: 420 },
  { key: 'computers',         label: 'Computers, Tablets & Networking',  query: 'MacBook Air M1 used',                    categoryId: '58',    maxPrice: 600 },
  { key: 'computers_ipad',    label: 'Tablets',                          query: 'iPad Air used',                          categoryId: '58',    maxPrice: 300 },
  { key: 'consumer_elec',     label: 'Consumer Electronics',             query: 'AirPods Pro 2nd generation',             categoryId: '293',   maxPrice: 150 },
  { key: 'rtx_gpu',           label: 'Graphics Cards',                   query: 'NVIDIA RTX 3070 graphics card',          categoryId: '58',    maxPrice: 250 },
  { key: 'cameras',           label: 'Cameras & Photo',                  query: 'Canon EOS DSLR camera body used',        categoryId: '625',   maxPrice: 400 },
  { key: 'sony_camera',       label: 'Mirrorless Cameras',               query: 'Sony Alpha a6000 camera body',           categoryId: '625',   maxPrice: 400 },

  // ── Gaming: high liquidity, tight price bands ────────────────────────────
  { key: 'video_games',       label: 'Video Games & Consoles',           query: 'Nintendo Switch OLED console used',      categoryId: '1249',  maxPrice: 220 },
  { key: 'video_games_ps5',   label: 'PlayStation',                      query: 'PS5 console disc edition used',          categoryId: '1249',  maxPrice: 350 },

  // ── Collectibles: only graded/sealed, which have real comp depth ─────────
  { key: 'sports_cards',      label: 'Sports Mem, Cards & Fan Shop',     query: 'Pokemon card PSA 10',                    categoryId: '64482', maxPrice: 150 },
  { key: 'sports_card_psa',   label: 'Graded Sports Cards',              query: 'sports card PSA 10 graded',              categoryId: '64482', maxPrice: 150 },
  { key: 'toys_hobbies',      label: 'Toys & Hobbies',                   query: 'LEGO sealed retired set',                categoryId: '220',   maxPrice: 150 },
  { key: 'lego_sealed',       label: 'LEGO Sealed Sets',                 query: 'LEGO sealed set new in box',             categoryId: '220',   maxPrice: 150 },
  { key: 'collectibles',      label: 'Collectibles',                     query: 'Funko Pop vaulted exclusive',            categoryId: '1',     maxPrice: 60  },
  { key: 'books_comics',      label: 'Books & Comics',                   query: 'comic book CGC 9.8 key issue',           categoryId: '267',   maxPrice: 120 },
  { key: 'coins',             label: 'Coins & Paper Money',              query: 'American Silver Eagle BU coin',          categoryId: '11116', maxPrice: 120  },

  // ── Apparel & tools: liquid brands only ──────────────────────────────────
  { key: 'sporting_goods',    label: 'Sporting Goods',                   query: 'Air Jordan 1 Retro size 10',             categoryId: '888',   maxPrice: 140 },
  { key: 'jordan_shoes',      label: 'Sneakers',                         query: 'Air Jordan retro sneakers size 10',      categoryId: '888',   maxPrice: 140 },
  { key: 'tools_industrial',  label: 'Business & Industrial',            query: 'DeWalt 20V cordless drill kit',          categoryId: '12576', maxPrice: 130 },
  { key: 'dewalt_tool',       label: 'Power Tools',                      query: 'DeWalt 20V MAX tool combo kit',          categoryId: '12576', maxPrice: 200 },
  { key: 'jewelry_watches',   label: 'Watches',                          query: 'Seiko automatic dive watch used',        categoryId: '281',   maxPrice: 200 },

  // ── Long tail: kept for coverage, ceilings keep them honest ──────────────
  { key: 'home_garden',       label: 'Home & Garden',                    query: 'KitchenAid stand mixer used',            categoryId: '11700', maxPrice: 200 },
  { key: 'health_beauty',     label: 'Health & Beauty',                  query: 'Dyson Airwrap styler',                   categoryId: '26395', maxPrice: 350 },
  { key: 'crafts',            label: 'Crafts',                           query: 'Cricut Maker cutting machine used',      categoryId: '14339', maxPrice: 200 },
  { key: 'baby',              label: 'Baby',                             query: 'UPPAbaby Vista stroller used',           categoryId: '2984',  maxPrice: 300 },
  { key: 'dvds_movies',       label: 'DVDs & Movies',                    query: '4K UHD Blu-ray steelbook boxset sealed', categoryId: '11232', maxPrice: 90  },
  { key: 'music',             label: 'Music',                            query: 'vinyl LP box set sealed',                categoryId: '11233', maxPrice: 90  },
];
