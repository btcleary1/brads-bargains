import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';

const FEEDBACK_PATH = 'deal-wiz/feedback.json';

interface FeedbackEntry {
  id: string;
  userId: string;
  email: string;
  type: 'enhancement' | 'bug';
  title: string;
  description: string;
  submittedAt: string;
  status: 'new' | 'reviewed' | 'done';
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, title, description } = await req.json();
  if (!type || !title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'Type, title, and description are required.' }, { status: 400 });
  }

  const entries = (await r2Get<FeedbackEntry[]>(FEEDBACK_PATH)) ?? [];
  const entry: FeedbackEntry = {
    id: Date.now().toString(36),
    userId: session.userId,
    email: session.email,
    type,
    title: title.trim(),
    description: description.trim(),
    submittedAt: new Date().toISOString(),
    status: 'new',
  };
  entries.unshift(entry);
  await r2Put(FEEDBACK_PATH, JSON.stringify(entries.slice(0, 500)));

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const session = await getSessionFromRequest(req);
  const adminSecret = process.env.DIGEST_SECRET ?? '';
  if (!adminSecret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (secret !== adminSecret && (!session || session.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = (await r2Get<FeedbackEntry[]>(FEEDBACK_PATH)) ?? [];
  return NextResponse.json({ entries });
}
