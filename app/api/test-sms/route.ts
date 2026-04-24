import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserPrefs } from '@/lib/tracker-data';
import { sendSMSDigest } from '@/lib/sms';
import { MOCK_DEALS } from '@/lib/mock-deals';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prefs = await getUserPrefs(session.userId);
  const phone = prefs.notificationPhone;
  if (!phone) return NextResponse.json({ error: 'No phone number saved.' }, { status: 400 });

  try {
    await sendSMSDigest(MOCK_DEALS.slice(0, 5), phone);
    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
