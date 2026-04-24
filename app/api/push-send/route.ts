import { NextRequest, NextResponse } from 'next/server';
import * as webpush from 'web-push';
import { getSessionFromRequest } from '@/lib/session';
import { getUserPrefs } from '@/lib/tracker-data';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, body, url } = await req.json();
  const prefs = await getUserPrefs(session.userId);
  const subscriptions: any[] = (prefs.pushSubscriptions as any[] | undefined) ?? [];

  if (subscriptions.length === 0) return NextResponse.json({ error: 'No push subscriptions found.' }, { status: 400 });

  const payload = JSON.stringify({ title: title || "Brad's Bargains", body, url: url || '/deals' });
  const results = await Promise.allSettled(subscriptions.map(sub => webpush.sendNotification(sub, payload)));
  const sent = results.filter(r => r.status === 'fulfilled').length;

  return NextResponse.json({ sent, total: subscriptions.length });
}
