import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { addFeedback, verifyFeedbackPayload, DealFeedback, FeedbackReason } from '@/lib/deal-feedback';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

const VALID_REASONS = new Set<string>([
  'not_my_niche', 'profit_too_low', 'bad_listing', 'too_dated',
  'my_kind_of_flip', 'great_margin', 'underpriced_gem',
]);

const DOWN_REASONS = [
  { key: 'profit_too_low', label: 'Profit too low' },
  { key: 'not_my_niche',   label: 'Not my niche' },
  { key: 'bad_listing',    label: 'Bad listing' },
  { key: 'too_dated',      label: 'Too outdated' },
];

const UP_REASONS = [
  { key: 'my_kind_of_flip',  label: 'My kind of flip' },
  { key: 'great_margin',     label: 'Great margin' },
  { key: 'underpriced_gem',  label: 'Hidden gem' },
];

function htmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reasonPage(p: string, s: string, verdict: 'up' | 'down', title: string): NextResponse {
  const reasons = verdict === 'down' ? DOWN_REASONS : UP_REASONS;
  const base = `${APP_URL}/api/deal-feedback?p=${encodeURIComponent(p)}&s=${encodeURIComponent(s)}`;
  const emoji   = verdict === 'up' ? '👍' : '👎';
  const heading = verdict === 'up' ? 'What do you like about this deal?' : "What's the issue?";
  const pillColor  = verdict === 'up' ? '#16A34A' : '#DC2626';
  const pillBg     = verdict === 'up' ? '#F0FDF4' : '#FEF2F2';
  const pillBorder = verdict === 'up' ? '#BBF7D0' : '#FECACA';
  const shortTitle = htmlEsc(title.length > 60 ? title.slice(0, 57) + '…' : title);

  const pills = reasons.map(r =>
    `<a href="${base}&reason=${r.key}" style="display:inline-block;margin:5px;padding:10px 20px;background:${pillBg};border:2px solid ${pillBorder};border-radius:20px;color:${pillColor};font-size:15px;font-weight:600;text-decoration:none;">${r.label}</a>`
  ).join('');

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:60px 20px;background:#0F172A;color:#fff;max-width:480px;margin:0 auto;">
  <p style="font-size:48px;margin:0 0 12px;">${emoji}</p>
  <p style="font-size:20px;font-weight:700;margin:0 0 6px;">${heading}</p>
  <p style="color:#94A3B8;font-size:13px;margin:0 0 28px;">${shortTitle}</p>
  <div style="display:flex;flex-wrap:wrap;justify-content:center;">${pills}</div>
  <p style="margin:28px 0 0;"><a href="${APP_URL}/deals" style="color:#4B5563;font-size:13px;">Skip</a></p>
</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function thanksPage(verdict: 'up' | 'down', reasonLabel: string): NextResponse {
  const emoji = verdict === 'up' ? '👍' : '👎';
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=${APP_URL}/deals"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:60px 20px;background:#0F172A;color:#fff;">
  <p style="font-size:48px;margin:0 0 16px;">${emoji}</p>
  <p style="font-size:20px;font-weight:600;margin:0 0 8px;">Thanks for your feedback!</p>
  <p style="color:#6B7280;margin:0 0 4px;">${htmlEsc(reasonLabel)}</p>
  <p style="color:#4B5563;font-size:13px;">Redirecting to deals&hellip;</p>
</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// GET — email feedback link, HMAC-signed so no login is required
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('p');
  const s = searchParams.get('s');
  if (!p || !s) return new NextResponse('Invalid link', { status: 400 });

  const data = verifyFeedbackPayload(p, s);
  if (!data) return new NextResponse('Link expired or invalid', { status: 400 });

  const rawReason = searchParams.get('reason') ?? '';
  const reason = VALID_REASONS.has(rawReason) ? rawReason as FeedbackReason : undefined;

  // First tap — show reason selection
  if (!reason) return reasonPage(p, s, data.verdict, data.title);

  // Second tap (reason selected) — record vote + reason
  await addFeedback(data.userId, {
    itemId: data.itemId,
    title: data.title,
    category: data.category,
    price: data.price,
    discountPct: data.discountPct,
    netProfit: data.netProfit,
    condition: data.condition,
    verdict: data.verdict,
    reason,
    source: 'email',
    feedbackAt: new Date().toISOString(),
  });

  const allReasons = [...DOWN_REASONS, ...UP_REASONS];
  const reasonLabel = allReasons.find(r => r.key === reason)?.label ?? 'Your recommendations will improve over time.';
  return thanksPage(data.verdict, reasonLabel);
}

// POST — in-app feedback, requires active session
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    itemId: string;
    title: string;
    category?: string;
    price?: number;
    discountPct?: number | null;
    netProfit?: number | null;
    condition?: string;
    verdict: 'up' | 'down';
  };

  if (!body.itemId || !body.title || !['up', 'down'].includes(body.verdict)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const fb: DealFeedback = {
    itemId: body.itemId,
    title: body.title,
    category: body.category ?? '',
    price: body.price ?? 0,
    discountPct: body.discountPct ?? null,
    netProfit: body.netProfit ?? null,
    condition: body.condition ?? '',
    verdict: body.verdict,
    source: 'app',
    feedbackAt: new Date().toISOString(),
  };

  await addFeedback(session.userId, fb);
  return NextResponse.json({ ok: true });
}
