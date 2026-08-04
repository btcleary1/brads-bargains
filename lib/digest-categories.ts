export interface DigestCategory {
  key: string;
  label: string;
  query: string;
  categoryId: string;
  maxPrice?: number;
}

export const DIGEST_CATEGORIES: DigestCategory[] = [
  { key: 'cell_phones',       label: 'Cell Phones & Accessories',        query: 'unlocked smartphone used',               categoryId: '15032' },
  { key: 'computers',         label: 'Computers, Tablets & Networking',  query: 'laptop MacBook used',                    categoryId: '58' },
  { key: 'consumer_elec',     label: 'Consumer Electronics',             query: 'electronics used',                       categoryId: '293' },
  { key: 'cameras',           label: 'Cameras & Photo',                  query: 'camera lens used',                       categoryId: '625' },
  { key: 'video_games',       label: 'Video Games & Consoles',           query: 'PS5 Xbox Switch game console',           categoryId: '1249' },
  { key: 'toys_hobbies',      label: 'Toys & Hobbies',                   query: 'toy game sealed collectible',            categoryId: '220' },
  { key: 'collectibles',      label: 'Collectibles',                     query: 'collectible rare vintage',               categoryId: '1' },
  { key: 'sports_cards',      label: 'Sports Mem, Cards & Fan Shop',     query: 'sports card PSA graded',                 categoryId: '64482' },
  { key: 'coins',             label: 'Coins & Paper Money',              query: 'gold silver coin bullion',               categoryId: '11116' },
  { key: 'sporting_goods',    label: 'Sporting Goods',                   query: 'sporting goods equipment used',          categoryId: '888' },
  { key: 'musical_inst',      label: 'Musical Instruments & Gear',       query: 'guitar synthesizer used',                categoryId: '619' },
  { key: 'home_garden',       label: 'Home & Garden',                    query: 'home appliance tool brand new',          categoryId: '11700' },
  { key: 'tools_industrial',  label: 'Business & Industrial',            query: 'power tool Dewalt Milwaukee used',       categoryId: '12576' },
  { key: 'health_beauty',     label: 'Health & Beauty',                  query: 'health beauty brand new sealed',         categoryId: '26395' },
  { key: 'books_comics',      label: 'Books & Comics',                   query: 'comic book CGC graded first edition',    categoryId: '267' },
  { key: 'art',               label: 'Art',                              query: 'original art painting signed',           categoryId: '550' },
  { key: 'antiques',          label: 'Antiques',                         query: 'antique vintage rare',                   categoryId: '20081' },
  { key: 'dvds_movies',       label: 'DVDs & Movies',                    query: 'Blu-ray 4K sealed new',                  categoryId: '11232' },
  { key: 'music',             label: 'Music',                            query: 'vinyl record sealed album',              categoryId: '11233' },
  { key: 'baby',              label: 'Baby',                             query: 'baby gear stroller car seat brand new',  categoryId: '2984' },
  { key: 'pet_supplies',      label: 'Pet Supplies',                     query: 'pet supply brand new',                  categoryId: '1281' },
  { key: 'crafts',            label: 'Crafts',                           query: 'craft supply Cricut Silhouette',         categoryId: '14339' },
  { key: 'stamps',            label: 'Stamps',                           query: 'rare stamp collection',                 categoryId: '260' },
];
