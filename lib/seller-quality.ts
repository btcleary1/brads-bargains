// Seller quality agent — fetches recent negative/neutral feedback from eBay Trading API,
// then uses Claude to flag patterns like non-delivery, counterfeits, or "not as described."

import Anthropic from '@anthropic-ai/sdk';
import { getEbayToken } from './ebay';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TRADING_URL     = 'https://api.ebay.com/ws/api.dll';
const TRADING_SBX_URL = 'https://api.sandbox.ebay.com/ws/api.dll';

function tradingUrl() {
  return process.env.EBAY_SANDBOX === 'true' ? TRADING_SBX_URL : TRADING_URL;
}

export type SellerVerdict = 'ok' | 'warning' | 'flag';

export interface SellerQualityResult {
  verdict: SellerVerdict;
  reason: string | null;
  recentNegativeCount: number;
}

// In-memory cache — keyed by seller username, expires after 6 hours
const CACHE_TTL = 6 * 60 * 60 * 1000;
const cache = new Map<string, { result: SellerQualityResult; ts: number }>();

interface FeedbackComment {
  type: 'Negative' | 'Neutral';
  comment: string;
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

async function fetchRecentNegativeFeedback(sellerUsername: string): Promise<FeedbackComment[]> {
  try {
    const token = await getEbayToken();
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<GetFeedbackRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <UserID>${sellerUsername}</UserID>
  <FeedbackType>FeedbackReceived</FeedbackType>
  <CommentTypeFilter>Negative</CommentTypeFilter>
  <CommentTypeFilter>Neutral</CommentTypeFilter>
  <DetailLevel>ReturnAll</DetailLevel>
  <Pagination>
    <EntriesPerPage>10</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetFeedbackRequest>`;

    const res = await fetch(tradingUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetFeedback',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID!,
        'X-EBAY-API-IAF-TOKEN': token,
      },
      body: soapBody,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.log(`[seller-quality] GetFeedback HTTP ${res.status} for ${sellerUsername}`);
      return [];
    }

    const xml = await res.text();

    if (xml.includes('<SeverityCode>Error</SeverityCode>')) {
      const msg = extractTag(xml, 'ShortMessage') ?? 'unknown';
      console.log(`[seller-quality] GetFeedback API error for ${sellerUsername}: ${msg}`);
      return [];
    }

    const comments: FeedbackComment[] = [];
    const blocks = Array.from(xml.matchAll(/<FeedbackDetail>([\s\S]*?)<\/FeedbackDetail>/g));

    for (const m of blocks) {
      const block = m[1];
      const type = extractTag(block, 'CommentType') as 'Negative' | 'Neutral' | null;
      const comment = extractTag(block, 'CommentText');
      if (comment && (type === 'Negative' || type === 'Neutral')) {
        comments.push({ type, comment });
      }
    }

    console.log(`[seller-quality] ${sellerUsername}: ${comments.length} negative/neutral comments fetched`);
    return comments;
  } catch (err) {
    console.log(`[seller-quality] fetch error for ${sellerUsername}: ${String(err).slice(0, 100)}`);
    return [];
  }
}

async function analyzeComments(
  sellerUsername: string,
  comments: FeedbackComment[],
): Promise<{ flag: boolean; reason: string | null }> {
  if (!process.env.ANTHROPIC_API_KEY || comments.length === 0) {
    return { flag: false, reason: null };
  }

  const list = comments
    .slice(0, 10)
    .map((c, i) => `${i + 1}. [${c.type}] "${c.comment}"`)
    .join('\n');

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `eBay seller "${sellerUsername}" recent negative/neutral feedback:\n${list}\n\nRespond with JSON only: {"flag": true|false, "reason": "<one short sentence or null>"}.\n\nFlag = true ONLY for serious patterns: non-delivery, item never arrived, counterfeit/fake, significantly not as described, repeated fraud signals.\nDo NOT flag for: slow shipping, minor packaging complaints, buyer changed mind.`,
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return { flag: false, reason: null };
    const parsed = JSON.parse(text.slice(start, end + 1));
    return { flag: !!parsed.flag, reason: parsed.reason ?? null };
  } catch {
    return { flag: false, reason: null };
  }
}

export async function checkSellerQuality(
  sellerUsername: string,
  feedbackPercent: number | null,
  feedbackScore: number | null,
): Promise<SellerQualityResult> {
  // Hard reject on stats alone (never cache — these are already filtered upstream, but belt-and-suspenders)
  if (feedbackPercent !== null && feedbackPercent < 95) {
    return { verdict: 'flag', reason: `${feedbackPercent}% positive feedback`, recentNegativeCount: 0 };
  }
  if (feedbackScore !== null && feedbackScore < 10) {
    return { verdict: 'warning', reason: 'New seller — very few ratings', recentNegativeCount: 0 };
  }

  // Check in-memory cache
  const hit = cache.get(sellerUsername);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.result;

  const comments = await fetchRecentNegativeFeedback(sellerUsername);
  const negCount = comments.filter(c => c.type === 'Negative').length;

  let result: SellerQualityResult = { verdict: 'ok', reason: null, recentNegativeCount: negCount };

  if (comments.length > 0) {
    const { flag, reason } = await analyzeComments(sellerUsername, comments);
    if (flag) {
      result = { verdict: 'flag', reason, recentNegativeCount: negCount };
    } else if (negCount >= 2) {
      result = { verdict: 'warning', reason: `${negCount} recent negative comments`, recentNegativeCount: negCount };
    }
  }

  cache.set(sellerUsername, { result, ts: Date.now() });
  return result;
}

// Check a batch of (seller, feedbackPercent, feedbackScore) tuples concurrently.
// Returns a Map of seller username → result.
export async function checkSellersBatch(
  sellers: { seller: string; feedbackPercent: number | null; feedbackScore: number | null }[],
): Promise<Map<string, SellerQualityResult>> {
  const unique = [...new Map(sellers.map(s => [s.seller, s])).values()];
  const results = await Promise.allSettled(
    unique.map(s => checkSellerQuality(s.seller, s.feedbackPercent, s.feedbackScore))
  );
  const map = new Map<string, SellerQualityResult>();
  unique.forEach((s, i) => {
    const r = results[i];
    map.set(s.seller, r.status === 'fulfilled' ? r.value : { verdict: 'ok', reason: null, recentNegativeCount: 0 });
  });
  return map;
}
