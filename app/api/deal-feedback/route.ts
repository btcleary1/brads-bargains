import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { addFeedback, verifyFeedbackPayload, DealFeedback } from '@/lib/deal-feedback';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

// GET — email feedback link, HMAC-signed so no login is required
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('p');
  const s = searchParams.get('s');
  if (!p || !s) return new NextResponse('Invalid link', { status: 400 });

  const data = verifyFeedbackPayload(p, s);
  if (!data) return new NextResponse('Link expired or invalid', { status: 400 });

  await addFeedback(data.userId, {
    itemId: data.itemId,
    title: data.title,
    category: data.category,
    price: data.price,
    discountPct: data.discountPct,
    netProfit: data.netProfit,
    condition: data.condition,
    verdict: data.verdict,
    source: 'email',
    feedbackAt: new Date().toISOString(),
  });

  const emoji = data.verdict === 'up' ? '👍' : '👎';
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=${APP_URL}/deals"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:60px 20px;background:#0F172A;color:#fff;">
  <p style="font-size:48px;margin:0 0 16px;">${emoji}</p>
  <p style="font-size:20px;font-weight:600;margin:0 0 8px;">Thanks for your feedback!</p>
  <p style="color:#6B7280;margin:0 0 4px;">Your recommendations will improve over time.</p>
  <p style="color:#4B5563;font-size:13px;">Redirecting to deals&hellip;</p>
</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
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
