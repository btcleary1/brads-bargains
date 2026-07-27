import { NextRequest, NextResponse } from 'next/server';
import * as webpush from 'web-push';
import { getSessionFromRequest } from '@/lib/session';
import { getUserPrefs } from '@/lib/tracker-data';
import { getAllUsers } from '@/lib/users';

export const runtime = 'nodejs';

const DIGEST_SECRET = process.env.DIGEST_SECRET ?? '';

export async function POST(req: NextRequest) {
  try {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL?.trim()}`,
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );

    const body = await req.json();
    const { title, body: msgBody, url, secret } = body;

    // Secret-based bypass — sends to all users' subscriptions
    // URL must be app-relative to prevent phishing via attacker-controlled push destinations
    if (DIGEST_SECRET && secret === DIGEST_SECRET) {
      const safeUrl = (!url || /^\//.test(url)) ? (url || '/deals') : '/deals';
      const users = await getAllUsers();
      const payload = JSON.stringify({ title: title || "AI FLIP", body: msgBody, url: safeUrl });
      let sent = 0;
      await Promise.allSettled(users.map(async u => {
        const prefs = await getUserPrefs(u.userId);
        const subs: any[] = (prefs.pushSubscriptions as any[] | undefined) ?? [];
        const results = await Promise.allSettled(subs.map(sub => webpush.sendNotification(sub, payload)));
        sent += results.filter(r => r.status === 'fulfilled').length;
      }));
      return NextResponse.json({ sent });
    }

    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const prefs = await getUserPrefs(session.userId);
    const subscriptions: any[] = (prefs.pushSubscriptions as any[] | undefined) ?? [];

    if (subscriptions.length === 0) return NextResponse.json({ error: 'No push subscriptions found.' }, { status: 400 });

    const payload = JSON.stringify({ title: title || "AI FLIP", body: msgBody, url: url || '/deals' });
    const results = await Promise.allSettled(subscriptions.map(sub => webpush.sendNotification(sub, payload)));
    const sent = results.filter(r => r.status === 'fulfilled').length;

    return NextResponse.json({ sent, total: subscriptions.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
