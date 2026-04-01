import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { saveCredentialsForUser } from '@/lib/webauthn-store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await saveCredentialsForUser(session.userId, []);
  return NextResponse.json({ success: true });
}
