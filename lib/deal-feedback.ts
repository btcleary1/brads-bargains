import { createHmac } from 'crypto';
import { r2Get, r2Put } from './r2';

export type DownReason = 'not_my_niche' | 'profit_too_low' | 'bad_listing' | 'too_dated' | 'damaged_item';
export type UpReason = 'my_kind_of_flip' | 'great_margin' | 'underpriced_gem';
export type FeedbackReason = DownReason | UpReason;

export interface DealFeedback {
  itemId: string;
  title: string;
  category: string;
  price: number;
  discountPct: number | null;
  netProfit: number | null;
  condition: string;
  verdict: 'up' | 'down';
  reason?: FeedbackReason;
  source: 'app' | 'email';
  feedbackAt: string;
}

const PREFIX = 'deal-wiz';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

export async function getFeedback(userId: string): Promise<DealFeedback[]> {
  return (await r2Get<DealFeedback[]>(`${PREFIX}/${userId}/deal-feedback.json`)) ?? [];
}

export async function addFeedback(userId: string, fb: DealFeedback): Promise<void> {
  const existing = await getFeedback(userId);
  // Replace if same itemId already has a vote (re-vote), prepend newest, keep max 200
  const filtered = existing.filter(f => f.itemId !== fb.itemId);
  await r2Put(`${PREFIX}/${userId}/deal-feedback.json`, JSON.stringify([fb, ...filtered].slice(0, 200)));
}

function hmacSig(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set — cannot sign feedback URLs');
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .slice(0, 24);
}

export function buildFeedbackUrl(
  userId: string,
  itemId: string,
  verdict: 'up' | 'down',
  meta: { title: string; category: string; price: number; discountPct: number | null; netProfit: number | null; condition: string },
): string {
  const payload = JSON.stringify({ userId, itemId, verdict, ...meta });
  const encoded = Buffer.from(payload).toString('base64url');
  return `${APP_URL}/api/deal-feedback?p=${encoded}&s=${hmacSig(payload)}`;
}

export function verifyFeedbackPayload(encoded: string, sig: string): {
  userId: string;
  itemId: string;
  verdict: 'up' | 'down';
  title: string;
  category: string;
  price: number;
  discountPct: number | null;
  netProfit: number | null;
  condition: string;
} | null {
  try {
    const payload = Buffer.from(encoded, 'base64url').toString();
    if (sig !== hmacSig(payload)) return null;
    const parsed = JSON.parse(payload);
    if (!parsed.userId || !parsed.itemId || !['up', 'down'].includes(parsed.verdict)) return null;
    return parsed;
  } catch {
    return null;
  }
}
