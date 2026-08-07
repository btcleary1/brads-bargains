// Strips eBay listing noise to extract a precise model query for cross-platform comp searches.
// Keeps: brand, model name, storage/RAM, generation, screen size, grade, colorway, size.
// Strips: condition, carriers, lock status, shipping fluff, seller copy, bundle words.

const NOISE_PHRASES = [
  /\blike\s+new\b/gi,
  /\bopen\s+box\b/gi,
  /\bfree\s+shipping\b/gi,
  /\bfast\s+ship(?:ping)?\b/gi,
  /\bcomes\s+with\b/gi,
  /\bread\s+desc(?:ription)?\b/gi,
  /\bplease\s+(?:read|note|see)\b/gi,
  /\bno\s+box\b/gi,
  /\bwith\s+box\b/gi,
  /\bin\s+(?:original\s+)?box\b/gi,
  /\bretail\s+box\b/gi,
  /\bfactory\s+unlocked\b/gi,
  /\bcarrier\s+unlocked\b/gi,
  /\bnetwork\s+unlocked\b/gi,
  /\bicloud\s+locked?\b/gi,
  /\bclean\s+(?:imei|esn)\b/gi,
  /\bfor\s+parts?\b/gi,
  /\bas[\s-]is\b/gi,
  /\bbuy\s+it\s+now\b/gi,
  /\bmake\s+(?:an?\s+)?offer\b/gi,
  /\bgreat\s+(?:deal|condition)\b/gi,
  /\bmint\s+condition\b/gi,
  /\bvery\s+good\b/gi,
  /\bfully\s+functional\b/gi,
  /\bfully\s+tested\b/gi,
  /\bwifi\s+\+\s+cellular\b/gi,
];

const NOISE_WORDS = new Set([
  'used', 'new', 'sealed', 'refurbished', 'refurb', 'mint', 'excellent',
  'good', 'fair', 'acceptable', 'tested', 'working', 'functional', 'parts',
  'unlocked', 'locked', 'genuine', 'authentic', 'oem',
  'bundle', 'extra', 'bonus', 'lot', 'set', 'kit',
  'included', 'include', 'accessories', 'accessory',
  'deal', 'sale', 'offer', 'perfect', 'beautiful', 'nice', 'sharp',
  'check', 'please', 'note', 'see', 'description',
  'the', 'and', 'or', 'for', 'with', 'from', 'by', 'at', 'an', 'a',
  'cosmetic', 'minor', 'scratches', 'marks', 'wear', 'grade', 'condition',
  // Carriers
  'gsm', 'cdma',
]);

const CARRIER_REGEX = /\b(at&t|verizon|t-mobile|t mobile|sprint|boost|cricket|metro(?:\s+pcs)?|straight\s+talk|consumer\s+cellular)\b/gi;

export function extractModelQuery(title: string): string {
  let q = title;

  // Strip multi-word noise phrases first
  for (const pattern of NOISE_PHRASES) {
    q = q.replace(pattern, ' ');
  }

  // Strip carriers
  q = q.replace(CARRIER_REGEX, ' ');

  // Strip single noise words (whole-word match, case-insensitive)
  q = q.replace(/\b\w+\b/g, word => {
    return NOISE_WORDS.has(word.toLowerCase()) ? ' ' : word;
  });

  // Strip standalone punctuation and symbols left behind
  q = q.replace(/['"()\[\]{}|\\\/]+/g, ' ');

  // Collapse whitespace
  q = q.replace(/\s{2,}/g, ' ').trim();

  // Take first 12 meaningful tokens — 8 was too short for collectibles where
  // differentiating words (e.g. "Gilded", "Storyboard") appear late in the title
  const tokens = q.split(/\s+/).filter(t => t.length > 1);
  return tokens.slice(0, 12).join(' ');
}
